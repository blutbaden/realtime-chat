import express, { Application } from "express";
import { createServer, Server as HTTPServer } from "http";
import path from "path";
import { Server as SocketIoServer } from "socket.io";
/*import {InMemorySessionStore} from "./sessionStore";
import {InMemoryMessageStore} from "./messageStore";*/

// const randomBytes = require('randombytes');

export class Server {
    private httpServer: HTTPServer;
    private app: Application;
    private io: SocketIoServer;

    private readonly DEFAULT_PORT = 5000;
    // private randomId;
    private users = [];


    constructor(/*private sessionStore: InMemorySessionStore, private messageStore: InMemoryMessageStore*/) {
        this.initialize();
    }

    private initialize(): void {
        this.app = express();
        this.httpServer = createServer(this.app);
        this.io = new SocketIoServer(this.httpServer);
        // this.randomId = randomBytes(8).toString("hex");

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
            const username = socket.handshake.auth.username;
            if (!username) {
                return next(new Error("invalid username"));
            }
            // The username is added as an attribute of the socket in order to be reused later
            socket.data.username = username;
            next();
        });
    }

    public pushAllUsers(socket){
        this.users = [];
        //  Map of all currently connected Socket instances, indexed by ID.
        for (let [id, socket] of this.io.of("/").sockets) {
            this.users.push({
                userID: id,
                username: socket.data.username,
            });
        }
        socket.emit("users", this.users);
    }

    public notifyExistingUsers(socket){
        // socket.broadcast.emit => Emit to all connected clients, except the socket itself.
        // The other form of broadcasting, io.emit => would have sent the “user connected” event
        // to all connected clients, including the new user.
        socket.broadcast.emit("user connected", {
            userID: socket.id,
            username: socket.data.username,
        });
    }

    public onSendMessage(socket){
        // forward the private message to the right recipient (and to other tabs of the sender)
        socket.on("private message", ({content, to}) => {
            // Emits to the given user ID.
            socket.to(to).emit("private message", {
                content,
                from: socket.id,
            });
        });
    }

    public notifyUsersUponDisconnection(socket){
        socket.on("disconnect", () => {
            socket.broadcast.emit("user disconnected", socket.id);
        });
    }

    public listen(callback: (port: number) => void): void {
        this.httpServer.listen(this.DEFAULT_PORT, () => {
            callback(this.DEFAULT_PORT);
        });
    }


}