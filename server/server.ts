import express, { Application } from "express";
import { createServer, Server as HTTPServer } from "http";
import path from "path";
import { Server as SocketIoServer } from "socket.io";
import {InMemorySessionStore} from "./sessionStore";
import {InMemoryMessageStore} from "./messageStore";

const randomBytes = require('randombytes');

export class Server {
    private httpServer: HTTPServer;
    private app: Application;
    private io: SocketIoServer;

    private readonly DEFAULT_PORT = 5000;
    private users = [];


    constructor(private sessionStore: InMemorySessionStore, private messageStore: InMemoryMessageStore) {
        this.initialize();
    }

    private initialize(): void {
        this.app = express();
        this.httpServer = createServer(this.app);
        this.io = new SocketIoServer(this.httpServer);
        this.configureApp();
        this.configureRoutes();
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
            this.pushAllUsers(socket);
            this.notifyExistingUsers(socket);
            this.onSendMessage(socket);
            this.notifyUsersUponDisconnection(socket);
        });
    }

    public registerMiddleware(){
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

    public pushAllUsers(socket){
        this.users = [];
        // fetch the list of messages upon connection
        const messagesPerUser = new Map();
        this.messageStore.findMessagesForUser(socket.data.userID).forEach((message) => {
            const { from, to } = message;
            const otherUser = socket.data.userID === from ? to : from;
            if (messagesPerUser.has(otherUser)) {
                messagesPerUser.get(otherUser).push(message);
            } else {
                messagesPerUser.set(otherUser, [message]);
            }
        });
        //  Map of all currently connected Socket instances, indexed by ID.
        // fetch existing users
        this.sessionStore.findAllSessions().forEach((session) => {
            this.users.push({
                userID: session.userID,
                username: session.username,
                connected: session.connected,
                messages: messagesPerUser.get(session.userID) || [],
            });
        });
        socket.emit("users", this.users);
    }

    public notifyExistingUsers(socket){
        // socket.broadcast.emit => Emit to all connected clients, except the socket itself.
        // The other form of broadcasting, io.emit => would have sent the “user connected” event
        // to all connected clients, including the new user.
        socket.broadcast.emit("user connected", {
            userID: socket.data.userID,
            username: socket.data.username,
            connected: true,
            messages: [],
        });
    }

    public onSendMessage(socket){
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

    public notifyUsersUponDisconnection(socket){
        socket.on("disconnect", async () => {
            const matchingSockets = await this.io.in(socket.data.userID).allSockets();
            const isDisconnected = matchingSockets.size === 0;
            if (isDisconnected) {
                // notify other users
                socket.broadcast.emit("user disconnected", socket.data.userID);
                // update the connection status of the session
                this.sessionStore.saveSession(socket.data.sessionID, {
                    userID: socket.data.userID,
                    username: socket.data.username,
                    connected: false,
                });
            }
        });
    }

    public persistSession(socket){
        this.sessionStore.saveSession(socket.data.sessionID, {
            userID: socket.data.userID,
            username: socket.data.username,
            connected: true,
        });
    }

    public emitSessionDetails(socket){
        // The session details are then sent to the user:
        socket.emit("session", {
            sessionID: socket.data.sessionID,
            userID: socket.data.userID,
        });
        // join the "userID" room
        socket.join(socket.data.userID);
    }

    public listen(callback: (port: number) => void): void {
        this.httpServer.listen(this.DEFAULT_PORT, () => {
            callback(this.DEFAULT_PORT);
        });
    }


}