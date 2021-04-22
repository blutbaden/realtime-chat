const URL = "http://localhost:5000";
const socket = io(URL);
let usersList = [];
let selectedUser;

let usernameAlreadySelected = false
const sessionID = localStorage.getItem("sessionID");

function onUsernameSelection(){
    usernameAlreadySelected = true;
    const username = $('#username').val()
    socket.auth = { username };
    $( "#select-username" ).addClass( "d-none" );
    $( "#message-panel" ).removeClass( "d-none" );
    socket.connect();
}

function onMessage() {
    const content = $('#message-content').val()
    console.log(selectedUser, content)
    if (selectedUser) {
        socket.emit("private message", {
            content,
            to: selectedUser.userID,
        });
        const message = {
            content,
            fromSelf: true,
        }
        selectedUser.messages.push({
            content,
            fromSelf: true,
        });
        addNewMessage(message, null)
    }
}

function createUserItemContainer(user) {
    const elm = $(`<div id=${user.userID} class='active-user'>
                     <p class="username">${user.username}</p>
                     <span class="status">${user.connected ? "online" : "offline"}</span>
                     <span class="new-messages">${user.hasNewMessages}</span>
                   </div>`)
        .click(function(e){
            const selectedUserId = $(this).attr("id")
            console.log(usersList)
            console.log(selectedUserId)
            selectedUser = usersList.find(u => u.userID === selectedUserId);
            console.log(selectedUser)
            selectedUser.hasNewMessages = false;
            //unselect if any Users From List
            $(".active-user.active-user--selected").attr("class","active-user");
            // add selected class
            $( this ).attr("class","active-user active-user--selected");
            $('#talking-with-info').html(`Talking with: "${user.username}"`);
            displayUserMessages(selectedUser)
        });
    $( "#active-user-container" ).append( elm );
}

function displayUserMessages(user) {
    const {messages} = user;
    messages.forEach(message => {
        addNewMessage(message, user)
    })
}

function addNewMessage(message, user) {
    const elm = $(`<li class='message'>
                     <div class="sender">${message.fromSelf ? "(yourself)" : user.username}</div>
                     ${message.content}
                   </li>`)
    $( "#messages" ).append( elm );
}

if (sessionID) {
    usernameAlreadySelected = true;
    socket.auth = { sessionID };
    $( "#select-username" ).addClass( "d-none" );
    $( "#message-panel" ).removeClass( "d-none" );
    socket.connect();
}

socket.on("connect", () => {
    usersList.forEach((user) => {
        if (user.self) {
            user.connected = true;
        }
    });
});

socket.on("session", ({ sessionID, userID }) => {
    // attach the session ID to the next reconnection attempts
    socket.auth = { sessionID };
    // store it in the localStorage
    localStorage.setItem("sessionID", sessionID);
    // save the ID of the user
    socket.userID = userID;
});

socket.on("users", (users) => {
    users.forEach((user) => {
        const alreadyExistingUser = document.getElementById(user.userID);
        if (!alreadyExistingUser) {
            createUserItemContainer(user);
        }
        user.messages.forEach((message) => {
            message.fromSelf = message.from === socket.userID;
        });
        for (let i = 0; i < usersList.length; i++) {
            const existingUser = usersList[i];
            if (existingUser.userID === user.userID) {
                existingUser.connected = user.connected;
                existingUser.messages = user.messages;
                return;
            }
        }
        user.self = user.userID === socket.userID;
        user.hasNewMessages = false;
        usersList.push(user);
    });
    // put the current user first, and sort by username
    usersList.sort((a, b) => {
        if (a.self) return -1;
        if (b.self) return 1;
        if (a.username < b.username) return -1;
        return a.username > b.username ? 1 : 0;
    });
});

socket.on("user connected", (user) => {
    console.log("user connected:", user)
    for (let i = 0; i < usersList.length; i++) {
        const existingUser = usersList[i];
        if (existingUser.userID === user.userID) {
            existingUser.connected = true;
            return;
        }
    }
    user.hasNewMessages = false;
    usersList.push(user);
});

socket.on("private message", ({ content, from, to }) => {
    for (let i = 0; i < usersList.length; i++) {
        const user = usersList[i];
        const fromSelf = socket.userID === from;
        if (user.userID === (fromSelf ? to : from)) {
            user.messages.push({
                content,
                fromSelf,
            });
            if (user !== selectedUser) {
                user.hasNewMessages = true;
            }
            break;
        }
    }
});

socket.on("user disconnected", (id) => {
    for (let i = 0; i < usersList.length; i++) {
        const user = usersList[i];
        if (user.userID === id) {
            user.connected = false;
            break;
        }
    }
});

socket.on("disconnect", () => {
    usersList.forEach((user) => {
        if (user.self) {
            user.connected = false;
        }
    });
});

socket.on("connect_error", (err) => {
    if (err.message === "invalid username") {
        usernameAlreadySelected = false;
        $( "select-username" ).removeClass( "d-none" );
        $( "content-container" ).addClass( "d-none" );
    }
});


