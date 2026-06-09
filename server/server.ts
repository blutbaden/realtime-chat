import express, {Application} from "express";
import {createServer, Server as HTTPServer} from "http";
import path from "path";
import {Server as SocketIoServer} from "socket.io";
import {InMemorySessionStore} from "./sessionStore";
import {InMemoryMessageStore} from "./messageStore";
import {InMemoryRoomStore} from "./roomStore";

const randomBytes = require('randombytes');

export class Server {
    private httpServer: HTTPServer;
    private app: Application;
    private io: SocketIoServer;

    private readonly PORT = parseInt(process.env.PORT ?? '4000', 10) || 4000;
    private queue = [];

    constructor(private sessionStore: InMemorySessionStore, private messageStore: InMemoryMessageStore,
                private roomStore: InMemoryRoomStore) {
        this.initialize();
    }

    private initialize(): void {
        this.app = express();
        this.httpServer = createServer(this.app);
        this.io = new SocketIoServer(this.httpServer, {
            cors: {
                origin: process.env.CORS_ORIGIN || "*",
                methods: ["GET", "POST"],
            }
        });
        this.configureApp();
        this.configureRoutes();
        this.createRooms("room-1", "Global Public Room", [], "PUBLIC");
        this.handleSocketConnection();
    }

    private configureApp(): void {
        this.app.use(express.static(path.join(__dirname, "../public")));
    }

    private configureRoutes(): void {
        this.app.get("/health", (_req, res) => {
            res.json({ status: "ok", uptime: process.uptime() });
        });
        this.app.get("/", (_req, res) => {
            res.sendFile(path.join(__dirname, "../public/index.html"));
        });
    }

    private handleSocketConnection(): void {
        this.registerMiddleware();
        this.io.on("connection", (socket) => {
            this.persistSession(socket);
            this.emitSessionDetails(socket);
            this.onSelectPublicChat(socket);
            this.onSelectRandomChat(socket);
        });
    }

    public registerMiddleware() {
        this.io.use(async (socket, next) => {
            const sessionID = socket.handshake.auth.sessionID;
            if (sessionID) {
                const session = this.sessionStore.findSession(sessionID);
                if (session) {
                    socket.data.sessionID = sessionID;
                    socket.data.userID = session.userID;
                    socket.data.username = session.username;
                    return next();
                }
            }
            const username = socket.handshake.auth.username;
            if (!username) {
                return next(new Error("invalid username"));
            }
            socket.data.sessionID = randomBytes(8).toString("hex");
            socket.data.userID = randomBytes(8).toString("hex");
            socket.data.username = username;
            next();
        });
    }

    public persistSession(socket) {
        this.sessionStore.saveSession(socket.data.sessionID, {
            userID: socket.data.userID,
            username: socket.data.username,
            connected: true,
        });
    }

    public emitSessionDetails(socket) {
        socket.emit("session", {
            sessionID: socket.data.sessionID,
            userID: socket.data.userID,
        });
    }

    public onSelectRandomChat(socket) {
        socket.on('select random chat', () => {
            this.findPeerForLoneSocket(socket);
            this.listenForRoomMessage(socket);
            this.leaveRoom(socket);
            this.notifyUsersUponDisconnection(socket);
        });
    }

    public onSelectPublicChat(socket) {
        socket.on('select public chat', () => {
            socket.join(socket.data.userID);
            this.pushAllUsers(socket);
            this.notifyExistingUsers(socket);
            this.onSendMessage(socket);
            this.pushAllRooms(socket);
            this.onUserJoinRoom(socket);
            this.listenForRoomMessage(socket);
            this.leaveRoom(socket);
            this.notifyUsersUponDisconnection(socket);
        });
    }

    public pushAllUsers(socket) {
        const userID = socket.data.userID;
        const users = [];
        const messagesPerUser = new Map();
        this.messageStore.findMessagesForUser(userID).forEach((message) => {
            const {from, to} = message;
            const otherUser = userID === from ? to : from;
            if (messagesPerUser.has(otherUser)) {
                messagesPerUser.get(otherUser).push(message);
            } else {
                messagesPerUser.set(otherUser, [message]);
            }
        });
        const roomsPerUser = new Map();
        this.sessionStore.findAllSessions().forEach((session) => {
            users.push({
                userID: session.userID,
                username: session.username,
                connected: session.connected,
                rooms: roomsPerUser.get(session.userID) || [],
                messages: messagesPerUser.get(session.userID) || [],
            });
        });
        socket.emit("users", users);
    }

    public notifyExistingUsers(socket) {
        socket.broadcast.emit("user connected", {
            userID: socket.data.userID,
            username: socket.data.username,
            connected: true,
            messages: [],
            rooms: [],
        });
    }

    public onSendMessage(socket) {
        socket.on("private message", ({content, to}) => {
            const message = {
                content,
                from: socket.data.userID,
                to,
            };
            socket.to(to).to(socket.data.userID).emit("private message", message);
            this.messageStore.saveMessage(message);
        });
    }

    public createRooms(roomID, roomName, users, roomType) {
        const room = {roomID, roomName, messages: [], users, roomType};
        this.roomStore.saveRoom(room);
    }

    public pushAllRooms(socket) {
        const rooms = this.roomStore.getAllRoomsByType("PUBLIC");
        socket.emit("rooms", rooms);
    }

    public onUserJoinRoom(socket) {
        socket.on('join-room', ({roomID}) => {
            const userID = socket.data.userID;
            this.roomStore.onUserJoin(userID, roomID);
            socket.join(roomID);
            this.io.in(roomID).emit('join-room', {userID, roomID});
            const room = this.roomStore.findRoom(roomID);
            if (room) {
                this.io.to(socket.id).emit('room-users', {users: room.users, roomID});
            }
        });
    }

    public listenForRoomMessage(socket) {
        socket.on('room-message', ({roomID, content}) => {
            const message = {content, from: socket.data.userID, to: roomID};
            this.io.to(roomID).emit('room-message', message);
        });
    }

    public leaveRoom(socket) {
        socket.on('leave room', ({userID, roomID}) => {
            const userID_ = socket.data.userID;
            this.roomStore.onUserLeave(userID_, roomID);
            socket.leave(roomID);
            this.io.in(roomID).emit('leave room', {userID: userID_, roomID});
            const room = this.roomStore.findRoom(roomID);
            if (room && room.roomType === "RANDOM") {
                this.findPeerForLoneSocket(socket);
            }
        });
    }

    public findPeerForLoneSocket(socket) {
        if (this.queue.length) {
            const peer = this.queue.shift();
            const roomID = socket.data.userID + '#' + peer.data.userID;
            this.createRooms(roomID, "room-" + roomID, [peer.data.userID, socket.data.userID], "RANDOM");
            peer.join(roomID);
            socket.join(roomID);
            peer.emit('random chat start', {name: "peer", room: roomID});
            socket.emit('random chat start', {name: "user", room: roomID});
        } else {
            this.queue.push(socket);
        }
    }

    public notifyUsersUponDisconnection(socket) {
        const userID = socket.data.userID;
        const username = socket.data.username;
        socket.on("disconnect", async () => {
            const matchingSockets = await this.io.in(userID).allSockets();
            const isDisconnected = matchingSockets.size === 0;
            if (isDisconnected) {
                socket.broadcast.emit("user disconnected", userID);
                this.sessionStore.saveSession(socket.data.sessionID, {
                    userID,
                    username,
                    connected: false,
                });
                const socketIndex = this.queue.findIndex(s => s.data.userID === userID);
                if (socketIndex !== -1) {
                    this.queue.splice(socketIndex, 1);
                }
                this.roomStore.findJoinedRoomsForUser(userID).forEach(room => {
                    const {roomID} = room;
                    this.roomStore.onUserLeave(userID, roomID);
                    socket.leave(roomID);
                    this.io.in(roomID).emit('leave room', {userID, roomID});
                });
            }
        });
    }

    public listen(callback: (port: number) => void): void {
        this.httpServer.listen(this.PORT, () => {
            callback(this.PORT);
        });
    }
}
