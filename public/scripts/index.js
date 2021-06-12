import socket from './init-socket.js';

////////////////////////// VARIABLES ///////////////////////////////
let usernameAlreadySubmitted = false;
let randomChatAlreadySelected = false;
let globalChatAlreadySelected = false;
let usersList = [];
let roomsList = [];
let selectedUser = null;
let selectedRoom = null;
let timerVar;
let totalSeconds = 0;

//////////////////////////// LOAD SCRIPTS ///////////////////////////

$(document).ready(function () {
    $(function () {
        // Loading
        const div_box = "<div id='load-screen'><div id='loading'></div></div>";
        $("body").prepend(div_box);
        // Fetch the session ID on application startup:
        const sessionID = localStorage.getItem("sessionID");
        if (sessionID) {
            usernameAlreadySubmitted = true;
            socket.auth = {sessionID};
            $("#load-screen").delay(700).fadeOut(600, function () {
                $(this).remove();
                $("#select-username").addClass("d-none");
                $(".blank").addClass("d-none");
                $("#chat-choice").removeClass("d-none");
                socket.connect();
            });
        } else {
            $("#select-username").removeClass("d-none");
            $("#load-screen").remove();
            $(".blank").addClass("d-none");
            $("#submit_username").click(function () {
                // We attach the entered username in the auth object, and then call socket.connect()
                usernameAlreadySubmitted = true;
                const username = $('#username').val()
                socket.auth = {username};
                $("#select-username").addClass("d-none");
                $(".blank").addClass("d-none");
                $("#chat-choice").removeClass("d-none");
                socket.connect();
            })
        }
    });
    $(function () {
        function onSend() {
            let content = "";
            if(randomChatAlreadySelected){
                content = $('.input__text').val();
            }else {
                content = $('.input__text').val();
            }
            if (content && content.trim() !== '') {
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
                    createMessageItem(message);
                }
                if (selectedRoom) {
                    socket.emit("room-message", {
                        roomID: selectedRoom.roomID,
                        content,
                    });
                }
                $('.input__text').val('').focus();
            }
        }
        $(".send-btn").click(function () {
            onSend();
        });
        $(window).on('keydown', function (e) {
            if (e.which == 13) {
                onSend();
                return false;
            }
        });
    });
    $(function () {
        $('.radio-group .radio').click(function () {
            $('.selected .fa').removeClass('fa-check');
            $('.radio').removeClass('selected');
            $(this).addClass('selected');
        });
        $('#select-btn').click(function () {
            if ($('#select-public').hasClass("selected")) {
                globalChatAlreadySelected = true;
                randomChatAlreadySelected = false;
                $("#chat-choice").addClass("d-none");
                $("#panel").removeClass("d-none");
                socket.emit("select public chat");
            } else if ($('#select-random').hasClass("selected")) {
                randomChatAlreadySelected = true;
                globalChatAlreadySelected = false;
                $("#chat-choice").addClass("d-none");
                $(".random-chat").removeClass("d-none");
                $(".random-chat-loading").removeClass("d-none");
                socket.emit("select random chat");
            }
        });
        $("#profile-img").click(function () {
            $("#status-options").toggleClass("active");
        });
        $(".leave-chat").click(function () {
            if (selectedRoom) {
                socket.emit("leave room", {
                    userID: socket.userID,
                    roomID: selectedRoom.roomID,
                });
                $(".random-chat-loading").removeClass("d-none");
                $(".random-chat-panel").addClass("d-none");
                totalSeconds = 0;
                clearInterval(timerVar);
                selectedRoom = null;
                $(".message-list").empty();
                $(".send__").prop('disabled', false);
                $("#chat_message").prop('disabled', false);
                $('#user-left-modal').modal('hide');
            }
        });
        $(".expand-button").click(function () {
            $("#profile").toggleClass("expanded");
            $("#contacts").toggleClass("expanded");
        });
        $("#status-options ul li").click(function () {
            $("#profile-img").removeClass();
            $("#status-online").removeClass("active");
            $("#status-away").removeClass("active");
            $("#status-busy").removeClass("active");
            $("#status-offline").removeClass("active");
            $(this).addClass("active");
            if ($("#status-online").hasClass("active")) {
                $("#profile-img").addClass("online");
            } else if ($("#status-away").hasClass("active")) {
                $("#profile-img").addClass("away");
            } else if ($("#status-busy").hasClass("active")) {
                $("#profile-img").addClass("busy");
            } else if ($("#status-offline").hasClass("active")) {
                $("#profile-img").addClass("offline");
            } else {
                $("#profile-img").removeClass();
            }
            $("#status-options").removeClass("active");
        });
    });
    $(function () {
        $( "#search-contact" ).keyup(function() {
            let value = $( this ).val();
            let query = value.toLowerCase();
            if(selectedRoom){
                $("#active-user").empty();
                let usersIds = selectedRoom.users;
                let users = [];
                usersIds.forEach(idUser => {
                    let user = usersList.find(user => user.userID === idUser);
                    users.push(user);
                });
                let filtered = users.filter(item => item.username.toLowerCase().indexOf(query) >= 0);
                filtered.forEach(user => {
                    if(user.userID !== socket.userID){
                        createUserItemContainer(user);
                    }
                });
            }
        });
    });
});

//////////////////////////// USER ////////////////////////////

function onGetSession() {
    socket.on("session", ({sessionID, userID}) => {
        // attach the session ID to the next reconnection attempts
        socket.auth = {sessionID};
        // store it in the localStorage
        localStorage.setItem("sessionID", sessionID);
        // save the ID of the user
        socket.userID = userID;
    });
}

function onConnectError() {
    // It's an event which will be emitted upon connection failure due to middleware errors or
    //  when the server is down for example
    socket.on("connect_error", (err) => {
        if (err.message === "invalid username") {
            usernameAlreadySubmitted = false;
            $("#select-username").removeClass("d-none");
            $("#panel").addClass("d-none");
            $(".random-chat").addClass("d-none");
            $("#chat-choice").addClass("d-none");
            localStorage.removeItem('sessionID');
        }
    });
}

function onUserEvent() {
    socket.on("users", (users) => {
        users.forEach((user) => {
            let {messages} = user;
            messages.forEach((message) => {
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
            let status = user.connected ? "online" : "offline";
            if (user.self) {
                $('#u-name').text(user.username)
                $('#current-user').text(user.username)
                $('#profile-img').removeClass().addClass(status)
            }
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
}

function onUserConnected() {
    socket.on("user connected", (user) => {
        const index = usersList.findIndex(u => u.userID === user.userID);
        if (index === -1) {
            user.hasNewMessages = false;
            usersList.push(user);
        } else {
            const existingUser = usersList[index];
            existingUser.connected = true;
            const userElm = $(`#${existingUser.userID}`);
            if (userElm.length > 0) {
                const statusElm = userElm.find('[class*="contact-status"]').first();
                statusElm.removeClass().addClass("contact-status online");
            }
        }
    });
}

function onUserDisconnected() {
    socket.on("user disconnected", (id) => {
        for (let i = 0; i < usersList.length; i++) {
            const user = usersList[i];
            if (user.userID === id) {
                user.connected = false;
                break;
            }
        }
        const userElm = $(`#${id}`);
        if (userElm.length > 0) {
            const statusElm = userElm.find('[class*="contact-status"]').first();
            statusElm.removeClass().addClass("contact-status offline");
        }
    });
}

///////////////////////////// ROOM ////////////////////////////////

function onRoomEvent() {
    socket.on("rooms", (rooms) => {
        rooms.forEach((room) => {
            room.messages.forEach((msg) => {
                msg.fromSelf = msg.from === socket.userID;
            });
            for (let i = 0; i < roomsList.length; i++) {
                const existingRoom = roomsList[i];
                if (existingRoom.roomID === room.roomID) {
                    existingRoom.users = room.users;
                    existingRoom.messages = room.messages;
                    return;
                }
            }
            roomsList.push(room);
        });
        roomsList.forEach(room => {
            createRoomItemContainer(room);
        })
    });
}

function onUserJoinRoom() {
    socket.on("join-room", ({userID, roomID}) => {
        let indexRoom = roomsList.findIndex(r => r.roomID === roomID);
        let room = roomsList[indexRoom];
        if(userID === socket.userID){
            selectedUser = null;
            selectedRoom = room;
        }
        if(room){
            console.log('room -', room);
            let indexUser = usersList.findIndex(u => u.userID === userID);
            let user = usersList[indexUser];
            if (user) {
                console.log('user', user)
                // add user to room users
                roomsList[indexRoom].users.push(userID);
                console.log('room -', roomsList);
                // display join message to all users in room
                if(selectedRoom && selectedRoom.roomID === roomID){
                    let content = user.username + " has join the channel.";
                    createNotificationItemOnUserJoinLeaveRoom(content);
                    if(user.userID !== socket.userID){
                        createUserItemContainer(user);
                    }
                }
            }
        }
    });
}

function onLeaveRoom() {
    socket.on("leave room", ({userID, roomID}) => {
        if(randomChatAlreadySelected){
            totalSeconds = 0;
            clearInterval(timerVar);
            $('#user-left-modal').modal('show');
            $(".send__").prop('disabled', true);
            $("#chat_message").prop('disabled', true);
            /*$('#user-left-modal').modal('toggle');*/
            /*$('#user-left-modal').modal('hide');*/
        }else {
            let indexUser = usersList.findIndex(u => u.userID === userID);
            if (indexUser !== -1) {
                // display left message to all users in room
                let user = usersList[indexUser];
                let content = user.username + " has left the channel.";
                createNotificationItemOnUserJoinLeaveRoom(content);
                // delete user from room
                let indexRoom = roomsList.findIndex(r => r.roomID === roomID);
                if(indexRoom !== -1){
                    let roomUsers = roomsList[indexRoom].users;
                    if(roomUsers.includes(userID)){
                        let index = roomUsers.findIndex(idUser => idUser === userID);
                        roomsList[indexRoom].users.splice(index, 1);
                        let userElm = $( `#${userID}` );
                        if(userElm){
                            userElm.remove();
                        }
                    }
                }
            }
        }
    });
}

function onReceiveRoomMessage() {
    socket.on("room-message", ({content, from, to}) => {
        const fromSelf = socket.userID === from;
        const message = {
            content,
            fromSelf: fromSelf,
        }
        const user = usersList.find(user => user.userID === from);
        for (let i = 0; i < roomsList.length; i++) {
            const room = roomsList[i];
            const fromSelf = socket.userID === from;
            if (room.roomID === to) {
                room.messages.push({
                    content,
                    fromSelf,
                });
                break;
            }
        }
        if(selectedRoom.roomID === to){
            createMessageItem(message);
        }
    });
}

///////////////////////////// PRIVATE MESSAGE ////////////////////////////////////

function onReceivePrivateMessage() {
    socket.on("private message", ({content, from, to}) => {
        if (selectedUser && selectedUser.userID === from) {
            const message = {
                content,
                fromSelf: false,
            }
            const user = usersList.find(user => user.userID === from);
            createMessageItem(message);
        } else {
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

function updateMessageStatus(from, isNew) {
    const userElm = $(`#${from}`)
    if (userElm.length > 0) {
        const statusElm = userElm.find('[class*="new-message"]').first();
        let count = statusElm.text();
        if (isNew && count && !isNaN(count)) {
            let n = parseInt(count);
            if (n >= 0) {
                statusElm.text((++n).toString());
            }
        } else {
            statusElm.text('0');
        }
    }
    const index = usersList.findIndex(u => u.userID === from);
    if (index !== -1) {
        usersList[index].hasNewMessages = isNew;
    }
}

///////////////////////////// RANDOM CHAT ////////////////////////////////////

function onRandomChatStart() {
    socket.on("random chat start", ({name, room}) => {
        timerVar = setInterval(countTimer, 1000);
        $(".random-chat-loading").addClass("d-none");
        $(".random-chat-panel").removeClass("d-none");
        selectedUser = null;
        selectedRoom = {roomID: room, roomName: name}
    });
}

///////////////////////////// OTHERS ////////////////////////////////////

function countTimer() {
    ++totalSeconds;
    let hour = Math.floor(totalSeconds / 3600);
    let minute = Math.floor((totalSeconds - hour * 3600) / 60);
    let seconds = totalSeconds - (hour * 3600 + minute * 60);
    if (hour < 10)
        hour = "0" + hour;
    if (minute < 10)
        minute = "0" + minute;
    if (seconds < 10)
        seconds = "0" + seconds;
    $("#timer").html(hour + ":" + minute + ":" + seconds);
}

///////////////////////////// CREATE ELM ////////////////////////////////////

function createUserItemContainer(user) {
    let status = user.connected ? "online" : "offline";
    const usr = $(`
        <li id=${user.userID} class="contact d-flex flex-row align-items-center">
            <div class="wrap">
                <span class="contact-status ${status}"></span>
                <img alt="" src="./images/default.png"/>
                <div class="meta">
                    <p class="name">${user.username}</p>
                    <p class="preview"></p>
                </div>
            </div>
            <div class="mr-3">
                <span class="badge count p-2 new-message">0</span>            
            </div>
        </li>`
    ).click(function () {
        const selectedUserId = $(this).attr("id");
        selectedUser = usersList.find(u => u.userID === selectedUserId);
        selectedRoom = null;
        $('#contact-name').text(selectedUser.username)
        //unselect if any Users From List
        $(".contact.active").attr("class", "contact d-flex flex-row align-items-center");
        // add selected class
        $(this).attr("class", "contact d-flex flex-row align-items-center active");
        $('#form').removeClass('d-none');
        $(".message-list").empty();
        selectedRoom = null;
        $(".panel-body p").attr("class", "");
        const {messages} = selectedUser;
        messages.forEach(message => {
            createMessageItem(message)
        });
    });
    $("#active-user").append(usr);
}

function createRoomItemContainer(room) {
    const roomElm = $(`<p id="${room.roomID}">#${room.roomName}</p><hr>`)
        .click(function () {
            const selectedRoomId = $(this).attr("id");
            if(!selectedRoom || (selectedRoom && selectedRoom.roomID !== selectedRoomId)){
                console.log("OOO");
                $(".panel-body p").attr("class", "");
                $(this).attr("class", "selected");
                let room = roomsList.find(r => r.roomID === selectedRoomId);
                $('#contact-name').text(room.roomName);
                    // add room users
                $("#active-user").empty();
                let users = room.users;
                console.log("users", users);
                users.forEach(idUser => {
                    let user = usersList.find(user => user.userID === idUser);
                    if(user.userID !== socket.userID){
                        createUserItemContainer(user);
                    }
                });
                // show room message
                $(".message-list").empty();
                const {messages} = room;
                messages.forEach(message => {
                    createMessageItem(message)
                });
                // emit event if user join for the first time
                selectedRoom = room;
                selectedUser = null;
                console.log(socket.userID)
                console.log(room.users)
                let isUserJoined = room.users.includes(socket.userID);
                console.log(isUserJoined)
                if(!isUserJoined){
                    socket.emit("join-room", {
                        userID: socket.userID,
                        roomID: selectedRoomId
                    });
                }
            }
        });
    $(".panel-body").append(roomElm);
}

function createMessageItem(message) {
    const msg = $(`
        <li class="${message.fromSelf ? "sent" : "replies"}">
            <img alt="" src="./images/default.png"/>
            <p>${message.content}</p>
        </li>
    `);
    $(".message-list").append(msg);
    $(".messages").animate({scrollTop: $(document).height()});
}

function createNotificationItemOnUserJoinLeaveRoom(content) {
    const msg = $(`
            <p class="text-black-50 small text-center my-1">${content}</p>
            `);
    $(".message-list").append(msg).animate({scrollTop: $(document).height()});
}

/////////////////////////////// CALL //////////////////////////////////

//-0-// Get Session
onGetSession();
//-1-// Listen to connection error
onConnectError();
//-2-// Handle User event
onUserEvent();
//-3-// On new user connected
onUserConnected();
//-4-// On User Disconnected
onUserDisconnected();
//-5-// On room event
onRoomEvent();
//-6-// On Join Room
onUserJoinRoom();
//-7-// On Leave Room
onLeaveRoom();
//-8-// On receive room message
onReceiveRoomMessage();
//-9-// On receive private message
onReceivePrivateMessage();
//-10-// On start random chat
onRandomChatStart();


