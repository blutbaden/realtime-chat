import { Server } from "./server";
/*import {InMemorySessionStore} from "./sessionStore";
import {InMemoryMessageStore} from "./messageStore";*/

const server = new Server(/*new InMemorySessionStore(), new InMemoryMessageStore()*/);

server.listen(port => {
    console.log(`Server is listening on http://localhost:${port}`);
});