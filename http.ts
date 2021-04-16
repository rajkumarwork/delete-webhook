import { APIGatewayProxyResult } from 'aws-lambda';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'Access-Control-Allow-Headers,Access-Control-Allow-Origin,Authorization,Content-Type,X-Amz-Date,X-Amz-Security-Token,X-Amz-User-Agent',
  'Access-Control-Allow-Credentials': false
};

function response(statusCode: number, payload: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers,
    body: JSON.stringify(payload)
  };
}

export async function ok(statusCode, payload?: unknown): Promise<APIGatewayProxyResult> {
  const body = payload ? payload : { message: 'No Payload' };

  return response(statusCode, body);
}

export function error(statusCode: number, message: string, payload?: unknown): APIGatewayProxyResult {
  const body = payload ? payload : { message };

  return response(statusCode, body);
}