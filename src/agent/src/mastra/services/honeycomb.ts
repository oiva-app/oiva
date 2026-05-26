import { env } from "../config/env";


export async function getQueryResult(datasetSlug: string, queryResultId: string) {
  const options = {method: 'GET', headers: {'X-Honeycomb-Team': env.HC_MCP_KEY}};

  return fetch(`https://api.honeycomb.io/1/query_results/${datasetSlug}/${queryResultId}`, options)
    .then(res => res.json())
    .catch(err => console.error(err));
}