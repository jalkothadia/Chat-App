
const http = require('http')
const {Server} = require('socket.io');

const users = {}

const server = http.createServer();

const io = new Server(server,{
    cors:{
        origin:"*"
    }
});


io.on('connection',socket=>{
    socket.on('new-user-joined',name=>{
        users[socket.id] = name;
        socket.broadcast.emit('user-joined',name);
    });

    socket.on('send',message=>{
        socket.broadcast.emit('receive',{message:message,name:users[socket.id]})
    })


}) 

const PORT = process.env.PORT || 8000;

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Backend running on port ${PORT}`);
});