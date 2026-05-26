#!/usr/bin/env bash

DATASET="__all__"
QUERY_RESULT_ID=4SSzmNoFT8d

# https://docs.honeycomb.io/api/query-data/get-query-result
# http GET "https://api.honeycomb.io/1/query_results/$DATASET/$QUERY_RESULT_ID"

# 🔴 DEALBREAKER - ENTERPRISE PLAN REQUIRED TO USE THIS API

curl --request GET \
  --url https://api.honeycomb.io/1/query_results/$DATASET/$QUERY_RESULT_ID \
  --header "X-Honeycomb-Team: $HC_API_KEY"