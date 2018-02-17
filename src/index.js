
import Raw from './raw';
import { warn } from './helpers';
import Client from './client';

import parseConnection from './util/parse-connection';

import { assign } from 'lodash'

import KnexContext from './classes/KnexContext'

// The client names we'll allow in the `{name: lib}` pairing.
const aliases = {
  'mariadb' : 'maria',
  'mariasql' : 'maria',
  'pg' : 'postgres',
  'postgresql' : 'postgres',
  'sqlite' : 'sqlite3'
};

export default function Knex(config) {
  if (typeof config === 'string') {
    return new Knex(assign(parseConnection(config), arguments[2]))
  }
  let Dialect;
  if (arguments.length === 0 || (!config.client && !config.dialect)) {
    Dialect = Client
  } else if (typeof config.client === 'function' && config.client.prototype instanceof Client) {
    Dialect = config.client
  } else {
    const clientName = config.client || config.dialect
    Dialect = require(`./dialects/${aliases[clientName] || clientName}/index.js`)
  }
  if (typeof config.connection === 'string') {
    config = assign({}, config, {connection: parseConnection(config.connection).connection})
  }

  const client = new Dialect(config);
  const context = new KnexContext(client);

  function knex() {
    return knex.queryBuilder().table(...arguments);
  }

  knex.__proto__ = context;

  return knex;
}

// Expose Client on the main Knex namespace.
Knex.Client = Client
