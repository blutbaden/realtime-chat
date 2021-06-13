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

    private readonly DEFAULT_PORT = 5000;
    private users = [];
    private queue = []; // list of sockets waiting for peers

    constructor(private sessionStore: InMemorySessionStore, private messageStore: InMemoryMessageStore,
                private roomStore: InMemoryRoomStore) {
        this.initialize();
    }

    private initialize(): void {
        this.app = express();
        this.httpServer = createServer(this.app);
        this.io = new SocketIoServer(this.httpServer);
        this.configureApp();
        this.configureRoutes();
        // create global public room
        this.createRooms("room-1", "Global Public Room", [], "PUBLIC");
        this.handleSocketConnection();
    }

    private configureApp(): void {
        this.app.use(express.static(path.join(__dirname, "../public")));
    }

    private configureRoutes(): void {
        this.app.get("/", (req, res) => {
            res.sendFile("index.html");
        });
    }

    private handleSocketConnection(): void {
        // Register a middleware
        this.registerMiddleware();
        // On Open connection
        this.io.on("connection", (socket) => {
            this.persistSession(socket);
            this.emitSessionDetails(socket);
            this.onSelectPublicChat(socket);
            this.onSelectRandomChat(socket);
        });
    }

    public registerMiddleware() {
        // We register a middleware which checks the username and allows the connection
        // A middleware function is a function that gets executed for every incoming connection.
        this.io.use(async (socket, next) => {
            const sessionID = socket.handshake.auth.sessionID;
            if (sessionID) {
                // find existing session
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
            // create new session
            // The username is added as an attribute of the socket in order to be reused later
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
        // The session details are then sent to the user:
        socket.emit("session", {
            sessionID: socket.data.sessionID,
            userID: socket.data.userID,
        });
        // join the "userID" room
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
        let userID = socket.data.userID;
        this.users = [];
        // fetch the list of messages upon connection
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
        // fetch the list of joined rooms upon connection
        const roomsPerUser = new Map();
        /*this.roomStore.findJoinedRoomsForUser(userID).forEach((room) => {
            if (roomsPerUser.has(userID)) {
                roomsPerUser.get(userID).push(room);
            } else {
                roomsPerUser.set(userID, [room]);
            }
            socket.join(room.roomID);
        });*/
        //  Map of all currently connected Socket instances, indexed by ID.
        // fetch existing users
        this.sessionStore.findAllSessions().forEach((session) => {
            this.users.push({
                userID: session.userID,
                username: session.username,
                connected: session.connected,
                rooms: roomsPerUser.get(session.userID) || [],
                messages: messagesPerUser.get(session.userID) || [],
            });
        });
        socket.emit("users", this.users);
    }

    public notifyExistingUsers(socket) {
        // socket.broadcast.emit => Emit to all connected clients, except the socket itself.
        // The other form of broadcasting, io.emit => would have sent the “user connected” event
        // to all connected clients, including the new user.
        socket.broadcast.emit("user connected", {
            userID: socket.data.userID,
            username: socket.data.username,
            connected: true,
            messages: [],
            rooms: [],
        });
    }

    public onSendMessage(socket) {
        // forward the private message to the right recipient (and to other tabs of the sender)
        socket.on("private message", ({content, to}) => {
            // Emits to the given user ID.
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
        const room = {roomID: roomID, roomName: roomName, messages: [], users: users, roomType: roomType}
        this.roomStore.saveRoom(room);
    }

    public pushAllRooms(socket) {
        const rooms = this.roomStore.getAllRoomsByType("PUBLIC");
        socket.emit("rooms", rooms);
    }

    public onUserJoinRoom(socket) {
        // Broadcast when a user join room
        socket.on('join-room', ({userID, roomID}) => {
            const userID_ = socket.data.userID;
            this.roomStore.onUserJoin(userID_, roomID);
            socket.join(roomID);
            this.io.in(roomID).emit('join-room',
                {
                    userID: userID_,
                    roomID
                }
            );
            // send users room to the joined user
            let room = this.roomStore.findRoom(roomID);
            if(room){
                this.io.to(socket.id).emit('room-users', {
                    users: room.users,
                    roomID
                });
            }
        });
    }

    public listenForRoomMessage(socket) {
        socket.on('room-message', ({roomID, content}) => {
            const userId = socket.data.userID;
            const message = {
                content,
                from: userId,
                to: roomID
            };
            this.io.to(roomID).emit('room-message', message);
        });
    }

    public leaveRoom(socket) {
        socket.on('leave room', ({userID, roomID}) => {
            const userID_ = socket.data.userID;
            this.roomStore.onUserLeave(userID_, roomID);
            socket.leave(roomID);
            this.io.in(roomID).emit('leave room', {userID, roomID});
            let room = this.roomStore.findRoom(roomID);
            if(room && room.roomType === "RANDOM"){
                this.findPeerForLoneSocket(socket);
            }
        });
    }

    public findPeerForLoneSocket(socket) {
        // this is place for possibly some extensive logic
        // which can involve preventing two people pairing multiple times
        if (this.queue.length) {
            // somebody is in queue, pair them!
            let peer = this.queue.shift();
            let roomID = socket.data.userID + '#' + peer.data.userID;
            // create room
            this.createRooms(roomID, "room-" + roomID, [peer.data.userID, socket.data.userID], "RANDOM");
            // join them both
            peer.join(roomID);
            socket.join(roomID);
            // exchange names between the two of them and start the chat
            peer.emit('random chat start', {name: "peer", room: roomID});
            socket.emit('random chat start', {name: "user", room: roomID});
        } else {
            // queue is empty, add our lone socket
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
                // notify other users
                socket.broadcast.emit("user disconnected", userID);
                // update the connection status of the session
                this.sessionStore.saveSession(socket.data.sessionID, {
                    userID: userID,
                    username: username,
                    connected: false,
                });
                // leave random rooms and notify users
                this.roomStore.findJoinedRoomsForUser(userID).forEach(room => {
                    let {roomID} = room;
                    this.roomStore.onUserLeave(userID, roomID);
                    socket.leave(roomID);
                    this.io.in(roomID).emit('leave room', {userID, roomID: roomID});
                })
            }
        });
    }

    public listen(callback: (port: number) => void): void {
        this.httpServer.listen(this.DEFAULT_PORT, () => {
            callback(this.DEFAULT_PORT);
        });
    }

}