/**
 * THIS MODULE IS A STUB.  It was abandoned after realizing that 
 many HC API endpoints are only available to Enterprise Plan subscribers
*/

import { env } from "../config/env";



export async function getQueryResult(datasetSlug: string, queryResultId: string) {
  const options = {method: 'GET', headers: {'X-Honeycomb-Team': env.HC_API_KEY as string}};

  return fetch(`https://api.honeycomb.io/1/query_results/${datasetSlug}/${queryResultId}`, options)
    .then(res => res.json())
    .catch(err => console.error(err));
}