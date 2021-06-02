const URL = "http://localhost:5000";
const socket = io(URL, { autoConnect: false });

// catch all listener so that any event received by the client will be printed in the console.
socket.onAny((event, ...args) => {
    console.log(event, args);
});

export default socket;