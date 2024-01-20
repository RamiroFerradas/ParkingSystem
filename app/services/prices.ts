import Papa from "papaparse";
import { Price } from "../models/Price";

const { DB_URL } = process.env;

export async function getPrices() {
  try {
    const response = await fetch(`${DB_URL}`, {
      next: { revalidate: 100, tags: ["prices"] },
    });
    const blob = await response.blob();
    const text = await new Response(blob).text();

    const prices = await new Promise<Price[]>((resolve, reject) => {
      Papa.parse(text, {
        header: true,
        complete: (results) => {
          const parsedPrices = results.data as Price[];

          resolve(parsedPrices);
        },
        error: (error: Error) => reject(new Error(error.message)),
      });
    });

    return prices;
  } catch (error) {
    throw new Error((error as Error).message);
  }
}
