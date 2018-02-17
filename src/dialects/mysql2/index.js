
// MySQL2 Client
// -------
import inherits from 'inherits';
import Client_MySQL from '../mysql';
import { assign } from 'lodash'

// Always initialize with the "QueryBuilder" and "QueryCompiler"
// objects, which extend the base 'lib/query/builder' and
// 'lib/query/compiler', respectively.
function Client_MySQL2(config) {
  Client_MySQL.call(this, config)
}
inherits(Client_MySQL2, Client_MySQL)

assign(Client_MySQL2.prototype, {

  // The "dialect", for reference elsewhere.
  driverName: 'mysql2',

  _driver() {
    return require('mysql2')
  },

  validateConnection(connection) {
    if (connection._fatalError) {
      return false
    }
    return true
  },

  _isTransactionError(err) {
    return err.code === 'ERR_SP_DOES_NOT_EXIST'
  }
})

export default Client_MySQL2;
