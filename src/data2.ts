import { PrismaClient } from '@prisma/client';
import { ParquetSchema, ParquetWriter, ParquetReader } from 'parquets';
const prisma = new PrismaClient();

// let schema = new ParquetSchema({
//     name: { type: 'UTF8' },
//     quantity: { type: 'INT64' },
//     price: { type: 'DOUBLE' },
//     date: { type: 'TIMESTAMP_MILLIS' },
//     in_stock: { type: 'BOOLEAN' },
//     block_number: { type: 'INT64' },
// });

let schema = new ParquetSchema({
    block_number: { type: 'UTF8', encoding: 'PLAIN' },
    txHash: { type: 'UTF8', encoding: 'PLAIN' },
    txIndex: { type: 'UTF8', encoding: 'PLAIN' },
    eventIndex: { type: 'UTF8', encoding: 'PLAIN' },
    user: { type: 'UTF8', encoding: 'PLAIN' },
    debt_token: { type: 'UTF8', encoding: 'PLAIN' },
    debt_face_amount: { type: 'UTF8', encoding: 'PLAIN' },

  });

async function run() {
    let reader = await ParquetReader.openFile('./default/0000500010_0000505028.parquet');
    // create a new cursor
    let cursor = reader.getCursor();
    
    // read all records from the file and print them
    let record = null;
    while (record = await cursor.next()) {
    console.log(record);
    }

}

async function getFrameWithPeterStats() {
  const items = await prisma.framethispeter.groupBy({
    by: ['token_id'],
    _count: {
      tweet_id: true,
    },
  });
  console.log(items.filter((a) => a._count.tweet_id > 1).sort((a, b) => b._count.tweet_id - a._count.tweet_id));
}

// run()
// getFrameWithPeterStats()
