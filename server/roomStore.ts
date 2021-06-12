/* abstract */ class RoomStore {
    saveRoomMessage(message, roomID) {}
    saveRoom(room) {}
    findRoom(roomID) {}
    getAllRooms() {}
    onUserJoin(user, roomID) {}
    onUserLeave(userID, roomID) {}
    findJoinedRoomsForUser(userID) {}
}

class Room {
    public roomID: string;
    public roomName: string;
    public messages: string[];
    public users: string[]; // save users Ids
    public roomType: 'RANDOM' | 'PUBLIC';
}

export class InMemoryRoomStore extends RoomStore {
    private readonly rooms: Room[];

    constructor() {
        super();
        this.rooms = [];
    }

    saveRoomMessage(message, roomID) {
        const index = this.rooms.findIndex(r => r.roomID === roomID);
        if(index !== -1){
            this.rooms[index].messages
                .push(message);
        }
    }

    saveRoom(room) {
        this.rooms.push(room);
    }

    findRoom(roomID) {
        return this.rooms.find(r => r.roomID !== roomID);
    }

    getAllRooms() {
        return this.rooms;
    }

    getAllRoomsByType(type) {
        return this.rooms.filter(r => r.roomType === type);
    }

    onUserJoin(userID, roomID) {
        const indexRoom = this.rooms.findIndex(r => r.roomID === roomID);
        if (indexRoom !== -1) {
            const room = this.rooms[indexRoom];
            if (!room.users.includes(userID)) {
                room.users.push(userID);
                this.rooms[indexRoom] = room;
            }
        }
    }

    onUserLeave(userID, roomID) {
        const indexRoom = this.rooms.findIndex(r => r.roomID === roomID);
        if (indexRoom !== -1) {
            const room = this.rooms[indexRoom];
            if (room.users.includes(userID)) {
                room.users = room.users.filter(id => id !== userID);
                if(room.roomType == "RANDOM"){
                    this.rooms.splice(indexRoom, 1);
                }else {
                    this.rooms[indexRoom] = room;
                }
            }
        }
    }

    findJoinedRoomsForUser(userID) {
        return this.rooms.filter(
            ({ users }) => users.filter(id => id === userID)
        );
    }

    findJoinedRoomsForUserByRoomType(userID, type) {
        return this.rooms.filter(
            ({ users, roomType }) => ((users.filter(id => id === userID)) && roomType === type));
    }
}