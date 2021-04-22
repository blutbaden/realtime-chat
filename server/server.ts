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
    private randomId;


    constructor(private sessionStore: InMemorySessionStore, private messageStore: InMemoryMessageStore) {
        this.initialize();
    }

    private initialize(): void {
        this.app = express();
        this.httpServer = createServer(this.app);
        this.io = new SocketIoServer(this.httpServer);
        this.randomId = randomBytes(8).toString("hex");

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
            socket.data.sessionID = this.randomId;
            socket.data.userID = this.randomId;
            socket.data.username = username;
            next();

        });

        this.io.on("connection", (socket) => {
            // persist session
            this.sessionStore.saveSession(socket.data.sessionID, {
                userID: socket.data.userID,
                username: socket.data.username,
                connected: true,
            });
            // emit session details
            socket.emit("session", {
                sessionID: socket.data.sessionID,
                userID: socket.data.userID,
            });

            // join the "userID" room
            socket.join(socket.data.userID);

            // fetch existing users
            const users = [];
            const messagesPerUser = new Map();
            this.messageStore.findMessagesForUser(socket.data.userID).forEach((message) => {
                const {from, to} = message;
                const otherUser = socket.data.userID === from ? to : from;
                if (messagesPerUser.has(otherUser)) {
                    messagesPerUser.get(otherUser).push(message);
                } else {
                    messagesPerUser.set(otherUser, [message]);
                }
            });
            this.sessionStore.findAllSessions().forEach((session) => {
                users.push({
                    userID: session.userID,
                    username: session.username,
                    connected: session.connected,
                    messages: messagesPerUser.get(session.userID) || [],
                });
            });
            socket.emit("users", users);

            // notify existing users
            socket.broadcast.emit("user connected", {
                userID: socket.data.userID,
                username: socket.data.username,
                connected: true,
                messages: [],
            });

            // forward the private message to the right recipient (and to other tabs of the sender)
            socket.on("private message", ({content, to}) => {
                const message = {
                    content,
                    from: socket.data.userID,
                    to,
                };
                socket.to(to).to(socket.data.userID).emit("private message", message);
                this.messageStore.saveMessage(message);
            });

            // notify users upon disconnection
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
        });
    }

    public listen(callback: (port: number) => void): void {
        this.httpServer.listen(this.DEFAULT_PORT, () => {
            callback(this.DEFAULT_PORT);
        });
    }


}