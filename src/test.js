console.log("test.js started");
import { scanForSecrets } from './secretDetector.js';

const sampleCode = `
const awsKey = "AKIAIOSFODNN7REALKEYEXAMPLE123";
const dbUrl = process.env.DATABASE_URL;
const stripe = "sk_live_51H8xExampleRealLookingValue";
`;

const result = await scanForSecrets('src/config/db.js', sampleCode);
console.log(JSON.stringify(result, null, 2));