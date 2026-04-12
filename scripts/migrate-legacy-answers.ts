import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("MONGODB_URI is not set in .env.local");
  process.exit(1);
}

const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    console.log("Connected successfully to MongoDB");

    // Uses the default database from the connection string
    const db = client.db();
    const collection = db.collection("answer");

    // In MongoDB, BSON type 2 is string.
    // We target all documents where the 'answer' field is a legacy string.
    const query = { answer: { $type: "string" } };
    const count = await collection.countDocuments(query);

    console.log(`Found ${count} legacy answers to migrate.`);

    if (count === 0) {
      console.log("Nothing to do. Exiting.");
      return;
    }

    const cursor = collection.find(query);
    let migratedCount = 0;

    for await (const doc of cursor) {
      const legacyAnswer = doc.answer;

      await collection.updateOne(
        { _id: doc._id },
        {
          $set: {
            answer: {
              type: "free_text",
              text: legacyAnswer,
            },
          },
        },
      );

      migratedCount++;
      if (migratedCount % 100 === 0) {
        console.log(`Migrated ${migratedCount} answers...`);
      }
    }

    console.log(`Migration complete. Total migrated: ${migratedCount}`);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

run().catch(console.dir);
