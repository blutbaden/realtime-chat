import { Server } from "./server";
import {InMemorySessionStore} from "./sessionStore";
import {InMemoryMessageStore} from "./messageStore";
import {InMemoryRoomStore} from "./roomStore";

const server = new Server(new InMemorySessionStore(), new InMemoryMessageStore(), new InMemoryRoomStore());

server.listen(port => {
    console.log(`Server is listening on http://localhost:${port}`);
});