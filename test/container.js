/**
 * Copyright 2015 Oursky Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/*eslint-disable dot-notation, no-unused-vars, quote-props */
import {assert} from 'chai';
import Container from '../lib/container';
import {AccessLevel} from '../lib/acl';

import mockSuperagent from './mock/superagent';

describe('Container', function () {
  it('should have default end-point', function () {
    let container = new Container();
    container.autoPubsub = false;
    assert.equal(
      container.endPoint,
      'http://skygear.dev/',
      'we expected default endpoint');
  });

  it('should clear access token on 104 AccessTokenNotAccepted', function () {
    let container = new Container();
    container.autoPubsub = false;
    container.configApiKey('correctApiKey');
    container._accessToken = 'incorrectApiKey';
    container.request = mockSuperagent([{
      pattern: 'http://skygear.dev/any/action',
      fixtures: function (match, params, headers, fn) {
        return fn({
          error: {
            name: 'AccessTokenNotAccepted',
            code: 104,
            message: 'token expired'
          }
        }, 401);
      }
    }]);

    return container.makeRequest('any:action', {}).then(function () {
      throw 'Expected to be reject by wrong access token';
    }, function (err) {
      assert.isNull(container.accessToken, 'accessToken not reset');
      assert.isNull(container.currentUser, 'currentUser not reset');
    });
  });

  it('should call userChange listener', function () {
    let container = new Container();
    container.autoPubsub = false;
    container.onUserChanged(function (user) {
      assert.instanceOf(user, container.User);
      assert.equal(user.id, 'user:id1');
    });
    return container._setUser({_id: 'user:id1'});
  });

  it('should able to cancel a registered userChange listener', function () {
    let container = new Container();
    container.autoPubsub = false;
    let handler = container.onUserChanged(function (user) {
      throw 'Cancel of onUserChanged failed';
    });
    handler.cancel();
    return container._setUser({_id: 'user:id1'});
  });
});

describe('Container auth', function () {
  let container = new Container();
  container.autoPubsub = false;
  container.request = mockSuperagent([{
    pattern: 'http://skygear.dev/auth/signup',
    fixtures: function (match, params, headers, fn) {
      const validUser = params['username'] === 'username' ||
        params['email'] === 'user@email.com';
      if (validUser && params['password'] === 'passwd') {
        return fn({
          'result': {
            'user_id': 'user:id1',
            'access_token': 'uuid1',
            'username': 'user1',
            'email': 'user1@skygear.io'
          }
        });
      }
      if (params['username'] === 'duplicated') {
        return fn({
          'error': {
            'type': 'ResourceDuplicated',
            'code': 101,
            'message': 'user duplicated'
          }
        }, 400);
      }
    }
  }, {
    pattern: 'http://skygear.dev/auth/login',
    fixtures: function (match, params, headers, fn) {
      const validUser = params['username'] === 'registered' ||
        params['email'] === 'user@email.com';
      if (validUser && params['password'] === 'passwd') {
        return fn({
          'result': {
            'user_id': 'user:id1',
            'access_token': 'uuid1',
            'username': 'user1',
            'email': 'user1@skygear.io'
          }
        });
      }
      return fn({
        'error': {
          'type': 'AuthenticationError',
          'code': 102,
          'message': 'invalid authentication information'
        }
      }, 400);
    }
  }]);
  container.configApiKey('correctApiKey');

  it('should signup successfully', function () {
    return container
      .signupWithUsername('username', 'passwd')
      .then(function (user) {
        assert.equal(
          container.accessToken,
          'uuid1');
        assert.instanceOf(container.currentUser, container.User);
        assert.equal(
          container.currentUser.id,
          'user:id1'
        );
      }, function () {
        throw new Error('Signup failed');
      });
  });

  it('should signup with email successfully', function () {
    return container
      .signupWithEmail('user@email.com', 'passwd')
      .then(function (user) {
        assert.equal(
          container.accessToken,
          'uuid1');
        assert.instanceOf(container.currentUser, container.User);
        assert.equal(
          container.currentUser.id,
          'user:id1'
        );
      }, function () {
        throw new Error('Signup failed');
      });
  });

  it('should not signup duplicate account', function () {
    return container
      .signupWithUsername('duplicated', 'passwd')
      .then(function (user) {
        throw new Error('Signup duplicated user');
      }, function (err) {
        assert.equal(
          err.error.message,
          'user duplicated');
      });
  });

  it('should login with correct password', function () {
    return container
      .loginWithUsername('registered', 'passwd')
      .then(function (user) {
        assert.equal(
          container.accessToken,
          'uuid1');
        assert.instanceOf(container.currentUser, container.User);
        assert.equal(
          container.currentUser.id,
          'user:id1'
        );
      }, function (error) {
        throw new Error('Failed to login with correct password');
      });
  });

  it('should login with email and correct password', function () {
    return container
      .loginWithEmail('user@email.com', 'passwd')
      .then(function (user) {
        assert.equal(
          container.accessToken,
          'uuid1');
        assert.instanceOf(container.currentUser, container.User);
        assert.equal(
          container.currentUser.id,
          'user:id1'
        );
      }, function (error) {
        throw new Error('Failed to login with correct password');
      });
  });

  it('should fail to login with incorrect password', function () {
    return container
      .loginWithUsername('registered', 'wrong')
      .then(function (user) {
        throw new Error('Login with wrong password');
      }, function (err) {
        assert.equal(
          err.error.message,
          'invalid authentication information');
      });
  });

  it('should be able to set null accessToken', function () {
    container._setAccessToken(null).then(function () {
      assert(container.accessToken).to.equal(null);
    });
  });
});

describe('Container users', function () {
  let container = new Container();
  container.request = mockSuperagent([
    {
      pattern: 'http://skygear.dev/user/query',
      fixtures: function (match, params, headers, fn) {
        if (params['emails'][0] === 'user1@skygear.io') {
          return fn({
            'result': [{
              data: {
                _id: 'user:id',
                email: 'user1@skygear.io',
                username: 'user1'
              },
              id: 'user:id',
              type: 'user'
            }]
          });
        }
      }
    }, {
      pattern: 'http://skygear.dev/user/update',
      fixtures: function (match, params, headers, fn) {
        /* eslint-disable camelcase */
        let user_id = params['_id'];
        if (user_id === 'user2_id') {
          return fn({
            'result': {
              _id: params._id,
              email: params.email,
              roles: params.roles
            }
          });
        }
        /* eslint-enable camelcase */
      }
    }
  ]);
  container.configApiKey('correctApiKey');

  it('query user with email successfully', function () {
    return container
      .getUsersByEmail(['user1@skygear.io'])
      .then(function (users) {
        assert.instanceOf(users[0], container.User);
        assert.equal(
          users[0].id,
          'user:id'
        );
        assert.equal(
          users[0].username,
          'user1'
        );
      }, function () {
        throw new Error('getUsersByEmail failed');
      });
  });

  it('should be able to set null user', function () {
    return container._setUser(null).then(function () {
      assert.isNull(container.currentUser);
    });
  });

  it('update user record', function () {
    let payload = {
      /* eslint-disable camelcase */
      _id: 'user2_id',
      /* eslint-enable camelcase */
      email: 'user2@skygear.io',
      roles: ['Tester']
    };

    let Tester = container.Role.define('Tester');
    let Developer = container.Role.define('Developer');

    let user = container.User.fromJSON(payload);
    let newEmail = 'user2-new@skygear.io';

    user.email = newEmail;
    user.addRole(Developer);

    return container.saveUser(user)
    .then(function (updatedUser) {
      assert.equal(updatedUser.id, user.id);
      assert.equal(updatedUser.username, user.username);
      assert.equal(updatedUser.email, newEmail);

      assert.equal(updatedUser.hasRole(Tester), true);
      assert.equal(updatedUser.hasRole(Developer), true);
    }, function (err) {
      throw new Error('update user record error', JSON.stringify(err));
    });
  });
});

describe('Container role', function () {
  let container = new Container();
  container.configApiKey('correctApiKey');
  container.request = mockSuperagent([{
    pattern: 'http://skygear.dev/role/admin',
    fixtures: function (match, params, headers, fn) {
      var roles = params['roles'];
      if (roles.indexOf('Killer') !== -1 && roles.indexOf('Police') !== -1) {
        return fn({
          'result': [
            'Killer',
            'Police'
          ]
        });
      }
    }
  }, {
    pattern: 'http://skygear.dev/role/default',
    fixtures: function (match, params, headers, fn) {
      var roles = params['roles'];
      if (roles.indexOf('Healer') !== -1 && roles.indexOf('Victim') !== -1) {
        return fn({
          'result': [
            'Healer',
            'Victim'
          ]
        });
      }
    }
  }]);

  it('set admin roles', function () {
    var Killer = container.Role.define('Killer');
    var Police = container.Role.define('Police');

    return container.setAdminRole([Killer, Police])
    .then(function (roles) {
      assert.include(roles, 'Killer');
      assert.include(roles, 'Police');
    }, function (err) {
      throw new Error('set admin roles failed');
    });
  });

  it('set default role', function () {
    var Healer = container.Role.define('Healer');
    var Victim = container.Role.define('Victim');

    return container.setDefaultRole([Victim, Healer])
    .then(function (roles) {
      assert.include(roles, 'Healer');
      assert.include(roles, 'Victim');
    }, function (err) {
      throw new Error('set default role failed');
    });
  });
});

describe('Container acl', function () {
  let container = new Container();
  container.configApiKey('correctApiKey');
  container.request = mockSuperagent([{
    pattern: 'http://skygear.dev/schema/access',
    fixtures: function (match, params, headers, fn) {
      let type = params['type'];
      let createRoles = params['create_roles'];

      if (type === 'script' &&
        createRoles.indexOf('Writer') !== -1 &&
        createRoles.indexOf('Web Master') !== -1) {

        return fn({
          result: {
            type: type,
            create_roles: createRoles   // eslint-disable-line camelcase
          }
        });
      }
    }
  }]);

  it('set record create access', function () {
    let Writer = container.Role.define('Writer');
    let WebMaster = container.Role.define('Web Master');
    let Script = container.Record.extend('script');

    return container.setRecordCreateAccess(Script, [Writer, WebMaster])
    .then(function (result) {
      let {type, create_roles: roles} = result; // eslint-disable-line camelcase

      assert.strictEqual(type, Script.recordType);
      assert.include(roles, Writer.name);
      assert.include(roles, WebMaster.name);
    }, function (err) {
      throw new Error('set record create access failed');
    });
  });

  it('get / set default ACL', function () {
    let Admin = container.Role.define('Admin');
    let ACL = container.ACL;
    let Note = container.Record.extend('note');

    // Before changes
    let acl = container.defaultACL;
    assert.lengthOf(acl.entries, 1);

    let aclEntry = acl.entries[0];
    assert.equal(aclEntry.level, AccessLevel.ReadLevel);
    assert.equal(aclEntry.role, container.Role.Public);

    let aNote = new Note({
      content: 'Hello World'
    });

    let recordACL = aNote.access;
    assert.instanceOf(recordACL, ACL);
    assert.lengthOf(recordACL.entries, 1);

    let recordACLEntry = recordACL.entries[0];
    assert.equal(recordACLEntry.level, AccessLevel.ReadLevel);
    assert.equal(recordACLEntry.role, container.Role.Public);

    // changes
    acl.removePublicReadAccess();
    acl.addWriteAccess(Admin);
    container.setDefaultACL(acl);

    // After changes
    acl = container.defaultACL;

    assert.lengthOf(acl.entries, 1);
    aclEntry = acl.entries[0];

    assert.equal(aclEntry.level, AccessLevel.WriteLevel);
    assert.equal(aclEntry.role, Admin);

    aNote = new Note({
      content: 'Hello World Again'
    });

    recordACL = aNote.access;
    assert.instanceOf(recordACL, ACL);
    assert.lengthOf(recordACL.entries, 1);

    recordACLEntry = recordACL.entries[0];
    assert.equal(recordACLEntry.level, AccessLevel.WriteLevel);
    assert.equal(recordACLEntry.role, Admin);

    // set back to default
    container.setDefaultACL(new ACL());
  });
});

describe('Container device registration', function () {
  let container = new Container();
  container.autoPubsub = false;
  container.request = mockSuperagent([{
    pattern: 'http://skygear.dev/device/register',
    fixtures: function (match, params, headers, fn) {
      if (params.id && params.id === 'non-exist') {
        return fn({
          'error': {
            'name': 'ResourceNotFound',
            'code': 110,
            'message': 'device not found'
          }
        });
      } else if (params.id) {
        return fn({
          'result': {
            'id': params.id
          }
        });
      } else {
        return fn({
          'result': {
            'id': 'device-id'
          }
        });
      }
    }
  }]);
  container.configApiKey('correctApiKey');

  it('should save device id successfully', function () {
    container
      .registerDevice('device-token', 'android')
      .then(function (deviceID) {
        assert(deviceID).to.equal('device-id');
        assert(container.deviceID).to.equal('device-id');
      }, function () {
        throw 'failed to save device id';
      });
  });

  it('should attach existing device id', function () {
    container._setDeviceID('existing-device-id').then(function () {
      return container.registerDevice('ddevice-token', 'ios');
    }).then(function (deviceID) {
      assert(deviceID).to.equal('existing-device-id');
      assert(container.deviceID).to.equal('existing-device-id');
    });
  });

  it('should retry with null deviceID on first call fails', function () {
    container._setDeviceID('non-exist').then(function () {
      return container.registerDevice('ddevice-token', 'ios');
    }).then(function (deviceID) {
      assert(deviceID).to.equal('device-id');
      assert(container.deviceID).to.equal('device-id');
    });
  });

  it('should be able to set null deviceID', function () {
    container._setDeviceID(null).then(function () {
      assert(container.deviceID).to.equal(null);
    });
  });
});

describe('lambda', function () {
  let container = new Container();
  container.autoPubsub = false;
  container.request = container.request = mockSuperagent([{
    pattern: 'http://skygear.dev/hello/world',
    fixtures: function (match, params, headers, fn) {
      return fn({
        'result': {
          'hello': 'world'
        }
      });
    }
  }, {
    pattern: 'http://skygear.dev/hello/args',
    fixtures: function (match, params, headers, fn) {
      return fn({
        'result': {
          'hello': params['args']
        }
      });
    }
  }, {
    pattern: 'http://skygear.dev/hello/failure',
    fixtures: function (match, params, headers, fn) {
      return fn({
        'error': {
          'type': 'UnknownError',
          'code': 1,
          'message': 'lambda error'
        }
      }, 400);
    }
  }]);
  container.configApiKey('correctApiKey');

  it('should call lambda correctly', function () {
    return container.lambda('hello:world').then(function (result) {
      assert.deepEqual(result, {'hello': 'world'});
    });
  });

  it('should pass dict parameters', function () {
    return container
      .lambda('hello:args', {'name': 'world'})
      .then(function (result) {
        assert.deepEqual(result, {
          'hello': {
            'name': 'world'
          }
        });
      });
  });

  it('should pass array parameters', function () {
    return container
      .lambda('hello:args', ['hello', 'world'])
      .then(function (result) {
        assert.deepEqual(result, {
          'hello': ['hello', 'world']
        });
      });
  });

  it('should parse error', function () {
    return container.lambda('hello:failure').then(function (result) {
      throw new Error('Failed to parse erroneous lambda result');
    }, function (err) {
      assert.equal(err.error.message, 'lambda error');
    });
  });

  it('should expose Query as constructor', function () {
    assert.isFunction(container.Query);
    assert.instanceOf(
      new container.Query(container.Record.extend('note')),
      container.Query
    );
  });

  it('should expose static methods of Query', function () {
    assert.isFunction(container.Query.or);
  });
});
/*eslint-enable dot-notation, no-unused-vars, quote-props */
