const { contextBridge, ipcRenderer } = require('electron');

// Expose ipcRenderer to the window object
contextBridge.exposeInMainWorld('api', {
    send: (channel, data1, data2,data3) => {
        ipcRenderer.send(channel, data1, data2,data3);
    },
    receive: (channel, func) => {
        ipcRenderer.on(channel, (event, ...args) => func(args));
    },
});