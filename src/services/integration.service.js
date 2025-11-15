const BACKEND_API_URL = process.env.BACKEND_API_URL;

if (!BACKEND_API_URL) {
   throw new Error("BACKEND_API_URL environment variable is not set.");
}

export const getDefectsCount = async (filter) => {
   const response = await fetch(`${BACKEND_API_URL}/api/v1/generator/defects/count`, {
      method: 'POST',
      headers: {
         'Content-Type': 'application/json',
      },
      body: JSON.stringify(filter),
   });

   if (!response.ok) {
      throw new Error(`Failed to fetch total count: ${await response.text()}`);
   }

   return await response.json();
}

export const getDefects = async (i, batchSize, filter) => {
   const url = new URL(`${BACKEND_API_URL}/api/v1/generator/defects`);
   url.searchParams.append('page', i);
   url.searchParams.append('size', batchSize);

   const dataResponse = await fetch(url.toString(), {
      method: 'POST',
      headers: {
         'Content-Type': 'application/json',
      },
      body: JSON.stringify(filter),
   });

   if (!dataResponse.ok) {
      throw new Error(`Failed to fetch data page ${i}: ${await dataResponse.text()}`);
   }

   const { data } = await dataResponse.json();

   return data;
}

export const updateReport = async (id, data) => {
   const response = await fetch(`${BACKEND_API_URL}/api/v1/generator/reports/${id}`, {
      method: 'PUT',
      headers: {
         'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
   });

   if (!response.ok) {
      throw new Error(`Failed to update report: ${await response.text()}`);
   }
}
