const URL = "http://localhost:4000";
const socket = io(window.location.host, { autoConnect: false });

// catch all listener so that any event received by the client will be printed in the console.
socket.onAny((event, ...args) => {
    console.log(event, args);
});

export default socket;
