import { Client } from "pg"
import dotenv from "dotenv";
dotenv.config();

const client = new Client({
    host: process.env.PG_HOST || 'localhost', 
    port: process.env.PG_PORT || 5432,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
})

client.connect()
    .then(() => console.log("Connected to PostgreSQL"))
    .catch(err => console.error("Connection error", err.stack));

export default client; 