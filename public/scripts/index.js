import socket from './init-socket.js';

// VARIABLES
let usernameAlreadySubmitted = false;
let randomChatAlreadySelected = false;
let globalChatAlreadySelected = false;
let usersList = [];
let roomsList = [];
let selectedUser = null;
let selectedRoom = null;
let timerVar;
let totalSeconds = 0;

//////////////////////////////

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
            const content = $('.input__text').val();
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
                    addNewMessage(message, null);
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
            if($('#select-public').hasClass("selected")){
                globalChatAlreadySelected = true;
                randomChatAlreadySelected = false;
                $("#chat-choice").addClass("d-none");
                $("#panel").removeClass("d-none");
                socket.emit("select public chat");
            }else if($('#select-random').hasClass("selected")){
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
            if(selectedRoom){
                socket.emit("leave room", {
                    roomID: selectedRoom.roomID,
                });
                $(".random-chat-loading").removeClass("d-none");
                $(".random-chat-panel").addClass("d-none");
                totalSeconds = 0;
                clearInterval(timerVar);
                selectedRoom = null;
                $(".message-list").empty();
                $(".send__").prop('disabled', false);
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
});

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
        usersList.forEach(user => {
            if (!user.self) {
                createUserItemContainer(user);
            }
        })
    });
}

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

function onUserConnected() {
    socket.on("user connected", (user) => {
        const index = usersList.findIndex(u => u.userID === user.userID);
        if (index === -1) {
            user.hasNewMessages = false;
            usersList.push(user);
            createUserItemContainer(user);
        } else {
            const existingUser = usersList[index];
            existingUser.connected = true;
            const userElm = $(`#${existingUser.userID}`);
            if (userElm.length > 0) {
                const statusElm = userElm.find('[class*="contact-status"]').first();
                statusElm.removeClass().addClass("contact-status online");
            } else {
                createUserItemContainer(user);
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

function onReceiveMessage() {
    socket.on("private message", ({content, from, to}) => {
        if (selectedUser && selectedUser.userID === from) {
            const message = {
                content,
                fromSelf: false,
            }
            const user = usersList.find(user => user.userID === from);
            addNewMessage(message, user);
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
        addNewMessage(message, user);
    });
}

function onUserJoinRoom() {
    socket.on("join-room-message", ({roomID, content}) => {
        if (selectedRoom.roomID === roomID) {
            displayElmOnJoinOrLeftRoom(content);
        }
    });
}

function displayElmOnJoinOrLeftRoom(content){
    const msg = $(`
            <p class="text-black-50 small text-center my-1">${content}</p>
            `);
    $(".message-list").append(msg).animate({scrollTop: $(document).height()});
}

function updateUserStatus() {
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

function onRandomChatStart() {
    socket.on("random chat start", ({name, room}) => {
        timerVar = setInterval(countTimer, 1000);
        $(".random-chat-loading").addClass("d-none");
        $(".random-chat-panel").removeClass("d-none");
        selectedRoom = { roomID: room, roomName: name }
    });
}

function onChatEnd() {
    socket.on("chat end", () => {
        totalSeconds = 0;
        clearInterval(timerVar);
        if(randomChatAlreadySelected){
            /*$('#user-left-modal').modal('toggle');*/
            $('#user-left-modal').modal('show');
            $(".send__").prop('disabled', true);
            /*$('#user-left-modal').modal('hide');*/
        }
    });
}

function onLeaveRoom() {
    socket.on("leave room", ({roomID, content}) => {
        if (selectedRoom.roomID === roomID) {
            displayElmOnJoinOrLeftRoom(content);
        }
    });
}

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
        $('#contact-name').text(selectedUser.username)
        //unselect if any Users From List
        $(".contact.active").attr("class", "contact d-flex flex-row align-items-center");
        // add selected class
        $(this).attr("class", "contact d-flex flex-row align-items-center active");
        $('#form').removeClass('d-none');
        $(".message-list").empty();
        selectedRoom = null;
        $(".panel-body p").attr("class", "");
        updateMessageStatus(selectedUserId, false);
        displayUserMessages(selectedUser);
    });
    $("#active-user").append(usr);
}

function createRoomItemContainer(room) {
    const roomElm = $(`<p id="${room.roomID}">#${room.roomName}</p><hr>`)
        .click(function () {
            const selectedRoomId = $(this).attr("id");
            socket.emit("join-room", {
                roomID: selectedRoomId
            });
            selectedRoom = roomsList.find(r => r.roomID === selectedRoomId);
            selectedUser = null;
            $('#contact-name').text(room.roomName)
            //unselect if any Users From List
            $(".contact.active").attr("class", "contact d-flex flex-row align-items-center");
            // add selected class
            $(this).attr("class", "selected-room");
            // display messages
            $('#form').removeClass('d-none');
            $(".message-list").empty();
            displayRoomMessages(selectedRoom);
        });
    $(".panel-body").append(roomElm);
}

function addNewMessage(message) {
    const msg = $(`
        <li class="${message.fromSelf ? "sent" : "replies"}">
            <img alt="" src="./images/default.png"/>
            <p>${message.content}</p>
        </li>
    `);
    $(".message-list").append(msg);
    $(".messages").animate({scrollTop: $(document).height()});
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

function displayUserMessages(user) {
    const {messages} = user;
    messages.forEach(message => {
        addNewMessage(message, user)
    })
}

function displayRoomMessages(room) {
    const {messages} = room;
    messages.forEach(message => {
        addNewMessage(message)
    })
}

function countTimer() {
    ++totalSeconds;
    let hour = Math.floor(totalSeconds /3600);
    let minute = Math.floor((totalSeconds - hour*3600)/60);
    let seconds = totalSeconds - (hour*3600 + minute*60);
    if(hour < 10)
        hour = "0"+hour;
    if(minute < 10)
        minute = "0"+minute;
    if(seconds < 10)
        seconds = "0"+seconds;
    $("#timer").html(hour + ":" + minute + ":" + seconds);
}

/*function createRoom(name) {
    const room = $(`
        <li class="">
           <span>${name}</span>
        </li>
    `);
    $("#rooms > ul").append(room);
}*/

//////////////////////////////////////////////

//-0-// Get Session
onGetSession();
//-1-// Listen to connection error
onConnectError();
//-2-// Handle User event
onUserEvent();
//-3-// On new user connected
onUserConnected();
//-4-// On room event
onRoomEvent();
//-5-// On receive message
onReceiveMessage();
//-6-// On receive room message
onReceiveRoomMessage();
//-7-// Update user status on connect/disconnect
updateUserStatus();
//-8-// On Join Room
onUserJoinRoom();
//-9-// On Random Chat Start
onRandomChatStart();
//-10-// On Chat End
onChatEnd();
//-11-// On Leave Room
onLeaveRoom();
//-12-// On User Disconnected
onUserDisconnected();

