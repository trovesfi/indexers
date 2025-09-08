import { num } from "starknet";

export function getClosePriceAtTimestamp(quotes: any[], timeSeconds: number) {
  const targetDate = new Date(timeSeconds * 1000); // Convert timestamp to milliseconds and create Date object

  // Normalize targetDate to the start of the day (00:00:00)
  targetDate.setUTCHours(0, 0, 0, 0);

  const debugInfo = quotes.filter((q) => {
    const date = new Date(q.date);
    const targetMinus1 = new Date(targetDate);
    targetMinus1.setDate(targetMinus1.getDate() - 1);
    const targetPlus1 = new Date(targetDate);
    targetPlus1.setDate(targetPlus1.getDate() + 1);
    return (
      date.getTime() >= targetMinus1.getTime() &&
      date.getTime() <= targetPlus1.getTime()
    );
  });
  // console.log(debugInfo);
  // Find the quote with a date that matches the start of the day
  const matchingQuote = quotes.find((quote) => {
    const quoteDate = new Date(quote.date);
    quoteDate.setUTCHours(0, 0, 0, 0); // Normalize quoteDate to start of the day
    return quoteDate.getTime() === targetDate.getTime();
  });

  // Return the close price if a matching quote was found, else return null or a default value
  return matchingQuote ? matchingQuote.close : null;
}

export function standariseAddress(address: string | bigint) {
  let _a = address;
  if (!address) {
    _a = "0";
  }
  const a = num.getHexString(num.getDecimalString(_a.toString()));
  return a;
}
