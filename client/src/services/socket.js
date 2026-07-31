import { io } from "socket.io-client";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

const socket = io(API_URL, {
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 5_000,
});

export default socket;
