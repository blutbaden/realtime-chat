import socket from './init-socket.js';

// VARIABLES
let usernameAlreadySelected = false;
let usersList = [];
let selectedUser = null;

//////////////////////////////

$(document).ready(function () {
    $(function () {
        // Fetch the session ID on application startup:
        const sessionID = localStorage.getItem("sessionID");
        if (sessionID) {
            usernameAlreadySelected = true;
            socket.auth = { sessionID };
            $( "#select-username" ).addClass( "d-none" );
            $( "#message-panel" ).removeClass( "d-none" );
            console.log("here", socket);
            socket.connect();
        }else {
            $( "#submit_username" ).click(function() {
                // We attach the entered username in the auth object, and then call socket.connect()
                usernameAlreadySelected = true;
                const username = $('#username').val()
                socket.auth = { username };
                $( "#select-username" ).addClass( "d-none" );
                $( "#message-panel" ).removeClass( "d-none" );
                socket.connect();
            })
        }
    });
    $(function (){
        $( "#send_message" ).click(function() {
            const content = $('#message-content').val();
            const message = {
                content,
                fromSelf: true,
            }
            if (selectedUser) {
                socket.emit("private message", {
                    content,
                    to: selectedUser.userID,
                });
                selectedUser.messages.push(message);
                addNewMessage(message, null);
            }
            $('#message-content').val('');
        });
    });
});

function onConnectError(){
    // It's an event which will be emitted upon connection failure due to middleware errors or
    //  when the server is down for example
    socket.on("connect_error", (err) => {
        console.log(err);
        if (err.message === "invalid username") {
            usernameAlreadySelected = false;
            $( "#select-username" ).removeClass( "d-none" );
            $( ".content-container" ).addClass( "d-none" );
        }
    });
}

function onUserEvent(){
    socket.on("users", (users) => {
        users.forEach((user) => {
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
        usersList.forEach(user => {
            createUserItemContainer(user);
        })
    });
}

function onUserConnected() {
    socket.on("user connected", (user) => {
        for (let i = 0; i < usersList.length; i++) {
            const existingUser = usersList[i];
            if (existingUser.userID === user.userID) {
                existingUser.connected = true;
                return;
            }
        }
        const index = usersList.findIndex(u => u.userID === user.userID);
        if(index === -1){
            user.hasNewMessages = false;
            usersList.push(user);
            createUserItemContainer(user);
        }else {
            const _user = usersList[index];
            _user.connected = true;
            const userElm = $(`#${user.userID}`);
            if(userElm.length > 0){
                const statusElm = userElm.find('[class*="status"]').first();
                statusElm.text('online');
            }else {
                createUserItemContainer(_user);
            }
        }
    });
}

function onUserDisconnected(){
    socket.on("user disconnected", (id) => {
        for (let i = 0; i < usersList.length; i++) {
            const user = usersList[i];
            if (user.userID === id) {
                user.connected = false;
                break;
            }
        }
        const userElm = $(`#${id}`);
        if(userElm.length > 0){
            const statusElm = userElm.find('[class*="status"]').first();
            statusElm.text('offline');
        }
    });
}

function onReceiveMessage(){
    socket.on("private message", ({ content, from, to }) => {
        console.log("=======>", content, from, to)
        if(selectedUser && selectedUser.userID === from){
            const message = {
                content,
                fromSelf: false,
            }
            const user = usersList.find(user => user.userID === from);
            addNewMessage(message, user);
        }else {
            updateMessageStatus(from, true);
        }
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
}

function updateUserStatus(){
    socket.on("connect", () => {
        usersList.forEach((user) => {
            if (user.self) {
                user.connected = true;
            }
        });
    });
    socket.on("disconnect", () => {
        usersList.forEach((user) => {
            if (user.self) {
                user.connected = false;
            }
        });
    });
}

function onGetSession(){
    socket.on("session", ({ sessionID, userID }) => {
        console.log("here==>", sessionID, "-",userID);
        // attach the session ID to the next reconnection attempts
        socket.auth = { sessionID };
        // store it in the localStorage
        localStorage.setItem("sessionID", sessionID);
        // save the ID of the user
        socket.userID = userID;
    });
}

function createUserItemContainer(user) {
    const elm = $(`<div id=${user.userID} class='active-user'>
                     <p class="username">${user.username} ${user.self ? " (yourself)" : ""}</p>
                     <span class="status">${user.connected ? "online" : "offline"}</span>
                     <span class="new-messages">${user.hasNewMessages}</span>
                   </div>`)
        .click(function() {
            const selectedUserId = $(this).attr("id");
            selectedUser = usersList.find(u => u.userID === selectedUserId);
            updateMessageStatus(selectedUser.userID, false);
            //unselect if any Users From List
            $(".active-user.active-user--selected").attr("class","active-user");
            // add selected class
            $( this ).attr("class","active-user active-user--selected");
            $('#form').removeClass('d-none');
            $('#talking-with-info').html(`Talking with: "${user.username}"`);
            $("#messages").empty();
            displayUserMessages(selectedUser)
        });
    $( "#active-user-container" ).append( elm );
}

function addNewMessage(message, user) {
    const elm = $(`<li class='message'>
                     <div class="sender">${message.fromSelf ? "(you)" : (user.username)}</div>
                     ${message.content}
                   </li>`)
    $( "#messages" ).append( elm );
}

function updateMessageStatus(from, isRead){
    const userElm = $(`#${from}`)
    if(userElm.length > 0){
        const statusElm = userElm.find('[class*="new-messages"]').first();
        statusElm.text(isRead);
    }
    const index = usersList.findIndex(u => u.userID === from);
    if(index !== -1){
        usersList[index].hasNewMessages = isRead;
    }
}

function displayUserMessages(user) {
    const {messages} = user;
    messages.forEach(message => {
        addNewMessage(message, user)
    })
}

//////////////////////////////////////////////

//-0-// Get Session
onGetSession();
//-1-// Listen to connection error
onConnectError();
//-2-// Handle User event
onUserEvent();
//-3-// On new user connected
onUserConnected();
//-4-// On receive message
onReceiveMessage();
//-5-// Update user status on connect/disconnect
updateUserStatus();
//-6-// On User Disconnected
onUserDisconnected();

