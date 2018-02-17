import { assign, isArray } from 'lodash'
import Promise from 'bluebird';
import * as helpers from './helpers';

import {PassThrough} from 'stream';


// The "Runner" constructor takes a "builder" (query, schema, or raw)
// and runs through each of the query statements, calling any additional
// "output" method provided alongside the query and bindings.
export default class Runner {
  constructor(builder) {
    this.builder = builder;
    this.client = this.builder.client;
    this.context = builder.__context;
    this.queries = [];
  }

  get log() {
    return this.client.log;
  }

  // "Run" the target, calling "toSQL" on the builder, returning
  // an object or array of queries to run, each of which are run on
  // a single connection.
  async run() {
    const isRoot = this.context.isRootContext();
    const originalContext = this.context;

    if(isRoot) {
      this.context = this.context.context();
    }

    try {
      this.context.emit('start', this.builder);
      this.builder.emit('start', this.builder);

      const sql = this.builder.toSQL();

      if(this.builder._debug) {
        this.log.debug(sql);
      }

      if(isArray(sql)) {
        return await this.queryArray(sql);
      }

      return await this.query(sql);
    } catch(error) {
      // If there are any "error" listeners, we fire an error event
      // and then re-throw the error to be eventually handled by
      // the promise chain. Useful if you're wrapping in a custom `Promise`.
      if(this.builder._events && this.builder._events.error) {
        //TODO: Deprecate?
        this.builder.emit('error', error);
      }

      throw error;
    } finally {
      this.builder.emit('end');
      if(isRoot) {
        this.context.end();
      }
      this.context = originalContext;
    }
  }

  // Stream the result set, by passing through to the dialect's streaming
  // capabilities. If the options are
  stream(options, handler) {
    // If we specify stream(handler).then(...
    if (arguments.length === 1) {
      if (typeof options === 'function') {
        handler = options;
        options = {};
      }
    }

    // Determines whether we emit an error or throw here.
    const hasHandler = typeof handler === 'function';

    const passThroughStream = new PassThrough({objectMode: true})
    const promise = this.runStream(hasHandler, passThroughStream, options)

    if(hasHandler) {
      handler(passThroughStream);

      return promise;
    }

    return passThroughStream;
  }

  async runStream(hasHandler, passThroughStream, options) {
    const sql = this.builder.toSQL()
    if (isArray(sql)) {
      const err = new Error('The stream may only be used with a single query statement.')
      if (hasHandler) {
        throw err
      }
      passThroughStream.emit('error', err)
      return
    }
    return this.client.stream(this.context, sql, passThroughStream, options)
  }

  // Allow you to pipe the stream to a writable stream.
  pipe(writable, options) {
    return this.stream(options).pipe(writable);
  }

  // "Runs" a query, returning a promise. All queries specified by the builder are guaranteed
  // to run in sequence, and on the same connection, especially helpful when schema building
  // and dealing with foreign key constraints, etc.
  async query(obj) {
    const {client, builder, context} = this;

    const toEmit = {__knexUid: 'TODO', ...obj};

    let queryPromise = Promise.resolve(client.query(context, obj));

    if(obj.timeout) {
      queryPromise = queryPromise.timeout(obj.timeout);
    }

    builder.emit('query', toEmit);

    try {
      const response = await queryPromise;
      const processedResponse = client.processResponse(response, this);
      const queryContext = this.builder.queryContext();
      const postProcessedResponse = this.client
        .postProcessResponse(processedResponse, queryContext);

      builder.emit(
        'query-response',
        postProcessedResponse,
        toEmit,
        builder
      );

      context.emit(
        'query-response',
        postProcessedResponse,
        toEmit,
        builder
      );

      return postProcessedResponse;
    } catch(error) {
      if(error instanceof Promise.TimeoutError) {
        const {timeout, sql, bindings} = obj;

        let cancelQuery = Promise.resolve();
        if(obj.cancelOnTimeout) {
          cancelQuery = client.cancelQuery(context);
        }

        try {
         await cancelQuery;
        } catch(cancelError) {
          // cancellation failed
          error = assign(cancelError, {
            message: `After query timeout of ${timeout}ms exceeded, cancelling of query failed.`,
            sql, bindings, timeout
          });

          builder.emit('query-error', error, assign({__knexUid: 'something'}, obj))
          throw error;
        }

        // cancellation succeeded, rethrow timeout error
        error = assign(error, {
          message: `Defined query timeout of ${timeout}ms exceeded when running query.`,
          sql, bindings, timeout
        })

        builder.emit('query-error', error, assign({__knexUid: 'something'}, obj))
        throw error;

      } else {
        builder.emit('query-error', error, assign({__knexUid: 'something'}, obj))
        throw error;
      }

    }
  }

  async queryArray(queries) {
    const executed = []
    for (const query of queries) {
      executed.push(await this.query(query))
    }
    return executed.length === 1 ? executed[0] : executed
  }
}