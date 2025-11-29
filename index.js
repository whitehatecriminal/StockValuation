import express from 'express';
import dotenv from 'dotenv';
import {registerMarketApis} from './marketApis.js';
import {connectDB} from './src/DB/DBConnect.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.send('Hello, World!');
});

//APIS
// registerMarketApis(app);

connectDB()
.then(()=> {
  app.listen(process.env.PORT, ()=> {
    console.log(`Server is listening on: http://localhost:${process.env.PORT}`);
  })
  app.on('err', (error) => {
    console.log('Error while listening to the port', error);
  })
}).catch((err)=> {
  console.log('Error while connecting to the database', err);
})

import router from './src/Routes/StockData.Routes.js';
app.use('/api/v1', router);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

export default app;
