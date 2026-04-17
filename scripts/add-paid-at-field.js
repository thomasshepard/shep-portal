import fetch from 'node-fetch';

const AIRTABLE_PAT = process.env.AIRTABLE_PAT;

if (!AIRTABLE_PAT) {
  console.error('Error: AIRTABLE_PAT environment variable is not set.');
  process.exit(1);
}

const BASE_ID = 'appZOi48qf8SzyOml';
const TABLE_ID = 'tbli7OArESf2SHL10';

async function addPaidAtField() {
  console.log('Attempting to add "Paid At" field to Airtable...');
  try {
    const response = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables/${TABLE_ID}/fields`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Paid At',
        type: 'date',
        options: { "dateFormat": { "name": "us" } }
      }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log('Successfully added "Paid At" field.');
      console.log('New Field ID:', data.id);
      process.exit(0);
    } else {
      console.error('Error adding field:', data);
      if (data.error && data.error.type === 'INVALID_REQUEST_UNKNOWN' && data.error.message.includes('A field with that name already exists')) {
        console.error('The field "Paid At" likely already exists. Please retrieve its ID manually or check Airtable. If the field is present, the script can be considered successful.');
        process.exit(0); 
      } else {
        process.exit(1);
      }
    }
  } catch (error) {
    console.error('Network or other error:', error);
    process.exit(1);
  }
}

addPaidAtField();
