// Adapted from @sat-utils/api~0.3.0

'use strict'

const satlib = require('@sat-utils/api-lib')

function determineEndpoint(event, context) {
	let endpoint = process.env.SATAPI_URL
	if (typeof endpoint === 'undefined') {
		if ('X-Forwarded-Host' in event.headers) {
			endpoint = `${event.headers['X-Forwarded-Proto']}://${event.headers['X-Forwarded-Host']}`
		} 
		else {
			endpoint = `${event.headers['X-Forwarded-Proto']}://${event.headers.Host}`
			if ('stage' in context) {
				endpoint = `${endpoint}/${context.stage}`
			}
		}
	}
	return endpoint
}

function buildResponse(statusCode, result) {
	return {
		statusCode,
		headers: {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*', // Required for CORS support to work
			'Access-Control-Allow-Credentials': true
		},
		body: result
	}
}

function buildRequest(event) {
	const method = event.method
	let query = {}
	console.log(event.body)
	if (method === 'POST' && event.body) {
		query = event.body
	}
	else if (method === 'GET' && event.queryStringParameters) {
		query = event.queryStringParameters
	}
	return query
}

module.exports = async (event, context, callback) => {
	const endpoint = determineEndpoint(event, context)
	const query = buildRequest(event)
	const result = await satlib.api.search(event.path, query, satlib.es, endpoint)

	if(result instanceof Error)
		return context
			.status(400)
			.fail(result.message)
	else
		return context
			.status(200)
			.succeed(result)
}
