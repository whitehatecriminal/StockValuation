import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: String(process.env.DB_PASSWORD),
    port: process.env.DB_PORT || 5432,
});

const connectDB = async()=>{
    try{
        await pool.connect();
        console.log("Connected to the database");
    }catch(err){
        console.error("Error while connectiong the Database:", err);
    }
}

export { pool, connectDB };