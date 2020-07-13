// Adapted from @sat-utils/ingest~0.3.0

'use strict'

const satlib = require('@sat-utils/api-lib')
const logger = console

module.exports = async (event, context, callback) => {
	logger.info(`Ingest Event: ${JSON.stringify(event)}`)
	let body = event.body
	try {
		if ((body.type && body.type === 'Feature') || (body.id && body.extent)) {
			// event is STAC Item or Collection JSON
			await satlib.ingest.ingestItem(body, satlib.es)
		}
		else if (body.url) {
			// event is URL to a catalog node
			const { url, recursive, collectionsOnly } = body
			const recurse = recursive === undefined ? true : recursive
			const collections = collectionsOnly === undefined ? false : collectionsOnly
			await satlib.ingest.ingest(url, satlib.es, recurse, collections)
		}
		else{
			logger.error('Unhandled ingest event', event)
			return context
				.status(400)
				.fail('Unhandled ingest event');
		}
	}
	catch (error) {
		logger.error(error)
		return context
			.status(400)
			.fail(error);
	}

	return context
		.status(200)
		.succeed('Ingest successful!');
}
