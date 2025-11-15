const BACKEND_API_URL = process.env.BACKEND_API_URL;
const BACKEND_API_KEY = process.env.BACKEND_API_KEY;

if (!BACKEND_API_URL) {
   throw new Error("BACKEND_API_URL environment variable is not set.");
}

if (!BACKEND_API_KEY) {
   throw new Error("BACKEND_API_KEY environment variable is not set.");
}

const headers = {
   'Content-Type': 'application/json',
   'x-api-key': BACKEND_API_KEY
}

export const getDefects = async (i, batchSize, filter) => {
   const url = new URL(`${BACKEND_API_URL}/api/v1/generator/defects`);
   url.searchParams.append('page', i);
   url.searchParams.append('size', batchSize);

   const response = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify(filter),
   });

   if (!response.ok) {
      throw new Error(`Failed to fetch data page ${i}: ${await response.text()}`);
   }

   const { data, totalPages } = await response.json();

   return { defects: data, totalPages };
}

export const updateReport = async (id, data) => {
   const response = await fetch(`${BACKEND_API_URL}/api/v1/generator/reports/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
   });

   if (!response.ok) {
      throw new Error(`Failed to update report: ${await response.text()}`);
   }
}
