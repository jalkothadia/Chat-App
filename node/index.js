
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
        if (typeof name !== 'string') return;
        const displayName = name.trim().slice(0,60);
        if (!displayName) return;
        users[socket.id] = displayName;
        socket.broadcast.emit('user-joined',displayName);
    });

    socket.on('send',message=>{
        if (typeof message !== 'string') return;
        const text = message.trim();
        if (!text || text.length > 2000 || !users[socket.id]) return;
        socket.broadcast.emit('receive',{message:text,name:users[socket.id]})
    });
}) 

const PORT = process.env.PORT || 8000;

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Backend running on port ${PORT}`);
});