<?php // db.inc.php
  class Record {
  }

  class Db {
    var $sessionId;
    var $connection;

    function __construct() {
      $config = parse_ini_file('/etc/furl/furl.conf', true);

      if (isset($config['Database'])) {
        $ec = $config['Database'];

        if (isset($ec['host']) && isset($ec['username']) && isset($ec['password'])
          && isset($ec['dbname'])) {
          $this->connection = new mysqli($ec['host'], $ec['username'],
            $ec['password'], $ec['dbname']);

          if ($this->connection === false) {
            die("Failed to connect to database");
          }
        } else {
          die("Environment not fully configured");
        }
      } else {
        die("Environment not configured");
      }
    }

    function newId() {
      return str_replace('/', '_', base64_encode(random_bytes(6)));
    }

    function exec($sql) {
//print "$sql\n";
      $statement = $this->connection->prepare($sql);
      $statement->execute();
      return $this->connection->insert_id;
    }

    function queryScalar($sql) {
//print "$sql\n";
      $result = false;
      if ($qr = $this->connection->query($sql)) {
//print "Here so far\n";
        $row = $qr->fetch_row();
//print_r($row);
//print "Also here\n";
//if ($row === null) {
//print "It was null\n";
//}
        if ($row != null) {
          $result = $row[0];
        }
        $qr->free();
      } else {
//print "Value of qr: '$qr'\n";
      }
      return $result;
    }

    function queryEnumeratedArray($sql) {
//print "$sql\n";
      $result = array();
      if ($qr = $this->connection->query($sql)) {
        while ($row = $qr->fetch_row()) {
          $result[] = $row[0];
        }
        $qr->free();
      }
      return $result;
    }

    function queryAssociativeArray($sql) {
      $result = array();
      if ($qr = $this->connection->query($sql)) {
        while ($row = $qr->fetch_row()) {
          $result[$row[0]] = $row[1];
        }
        $qr->free();
      }
      return $result;
    }

    function query($sql) {
      $result = array();
      if ($qr = $this->connection->query($sql)) {
        while ($row = $qr->fetch_assoc()) {
          $o = new Record();
          foreach ($row as $field => $value) {
            $o->$field = $value;
          }
          $result[] = $o;
        }
        $qr->free();
      }
      return $result;
    }

    function populate($object, $sql) {
      if ($qr = $this->connection->query($sql)) {
        if ($row = $qr->fetch_assoc()) {
          foreach ($row as $field => $value) {
            $object->$field = $value;
          }
          $qr->free();
          return true;
        }
      }
      return false;
    }

    function applyOverObjects($f, $init, $sql) {
      $next = $init;
      if ($qr = $this->connection->query($sql)) {
        while ($row = $qr->fetch_field()) {
          $next = $f($next, $row);
        }
      }
      return $next;
    }

    function clean($name) {
      return preg_replace('[^a-zA-Z0-9_-]', '', $name);
    }

    function set($name, $type, $value) {
      $nameToUse = $this->clean($name);
      $statement = $this->connection->prepare("SELECT @$nameToUse := ?");
      $statement->bind_param($type, $value);
      $statement->bind_result($result);
      $statement->execute();
      return $result;
    }

    function setInteger($name, $value) {
//print "SELECT @$name := '" . $value . "';";
      $this->set($name, 'i', $value);
    }

    function setString($name, $value) {
      $this->set($name, 's', $value);
    }

    function setPassword($name, $value) {
      $nameToUse = $this->clean($name);
      $statement = $this->connection->prepare("SELECT @$nameToUse := PASSWORD(?)");
      $statement->bind_param('s', $value);
      $statement->bind_result($result);
      $statement->execute();
      return $result;
    }

    function setDouble($name, $value) {
      $this->set($name, 'd', $value);
    }

    function setBinary($name, $value) {
      $this->set($name, 'b', $value);
    }

    function getCollectionId($appId, $name, $addIfNotExists) {
      $this->setInteger('appId', $appId);
      $this->setString('name', $name);
      $collectionId = $this->queryScalar('SELECT c.id'
        . ' FROM collection c'
        . ' WHERE c.appId = @appId'
        . ' AND c.name = @name');

      if ($collectionId !== false) {
        return $collectionId;
      } else if ($addIfNotExists) {
        return $this->exec('INSERT INTO collection'
          . ' (name, appId)'
          . ' VALUES (@name, @appId)');
      } else {
        return false;
      }
    }

    function getAppId($name, $addIfNotExists = false) {
      $this->setString('name', $name);
      $appId = $this->queryScalar('SELECT id FROM app WHERE name = @name');

      if ($appId !== false) {
        return $appId;
      } else if ($addIfNotExists) {
        return $this->exec('INSERT INTO app (name) VALUES (@name)');
      } else {
        return false;
      }
    }

    function getUserId($appId, $name, $addIfNotExists = false) {
      $this->setInteger('appId', $appId);
      $this->setString('name', $name);
      $userId = $this->queryScalar('SELECT id FROM user WHERE appId = @appId'
        . ' AND name = @name');

      if ($userId !== false) {
        return $userId;
      } else if ($addIfNotExists) {
        return $this->exec('INSERT INTO user'
          . ' (appId, name)'
          . ' VALUES (@appId, @name)');
      } else {
        return false;
      }
    }

    function changePassword($userId, $password) {
      $this->setInteger('userId', $userId);
      $this->setPassword('password', $password);
      $this->exec('UPDATE user SET password = @password WHERE id = @userId');
    }

    function getRoleId($appId, $name, $addIfNotExists = false) {
      $this->setInteger('appId', $appId);
      $this->setString('name', $name);
      $roleId = $this->queryScalar('SELECT id FROM role WHERE appId = @appId'
        . ' AND name = @name');

      if ($roleId !== false) {
        return $roleId;
      } else if ($addIfNotExists) {
        return $this->exec('INSERT INTO role'
          . ' (appId, name)'
          . ' VALUES (@appId, @name)');
      } else {
        return false;
      }
    }

    function addRoleToUser($roleId, $userId) {
      $this->setInteger('userId', $userId);

      if ($roleId == 'ALL') {
        $db->exec('INSERT INTO userRole'
          . ' (roleId, userId)'
          . ' SELECT r.id, @userId'
          . ' FROM user u'
          . ' JOIN role r ON r.appId = u.appId'
          . ' WHERE u.id = @userId');
      } else {
        $this->setInteger('roleId', $roleId);
        $this->exec('INSERT INTO userRole'
          . ' (roleId, userId)'
          . ' VALUES (@roleId, @userId)');
      }
    }

    function addRoleToCollection($roleId, $collectionId) {
      $this->setInteger('collectionId', $collectionId);

      if ($roleId == 'ALL') {
        $this->exec('INSERT INTO collectionRole'
          . ' (roleId, collectionId)'
          . ' SELECT r.id, @collectionId'
          . ' FROM collection c'
          . ' JOIN role r ON r.appId = u.appId'
          . ' WHERE c.id = @collectionId');
      } else {
        $this->setInteger('roleId', $roleId);
        $this->exec('INSERT INTO collectionRole'
          . ' (collectionId, roleId, canSelect, canInsert, canUpdate, canDelete)'
          . ' VALUES (@collectionId, @roleId, false, false, false, false)');
      }
    }

    function changeCreate($roleId, $grant) {
      $this->setInteger('roleId', $roleId);

      $this->exec('UPDATE role'
        . ' SET developer = ' . ($grant ? 'TRUE' : 'FALSE')
        . ' WHERE id = @roleId');
    }

    function changeCollectionRolePermission($roleId, $collectionId, $perm, $grant) {
      $this->setInteger('roleId', $roleId);
      $this->setInteger('collectionId', $collectionId);

      if ($perm == 'select' || $perm == 'all') {
        $this->exec('UPDATE collectionRole'
          . ' SET canSelect = ' . ($grant ? 'TRUE' : 'FALSE')
          . ' WHERE roleId = @roleId'
          . ' AND collectionId = @collectionId');
      }

      if ($perm == 'insert' || $perm == 'all') {
        $this->exec('UPDATE collectionRole'
          . ' SET canInsert = ' . ($grant ? 'TRUE' : 'FALSE')
          . ' WHERE roleId = @roleId'
          . ' AND collectionId = @collectionId');
      }

      if ($perm == 'update' || $perm == 'all') {
        $this->exec('UPDATE collectionRole'
          . ' SET canUpdate = ' . ($grant ? 'TRUE' : 'FALSE')
          . ' WHERE roleId = @roleId'
          . ' AND collectionId = @collectionId');
      }

      if ($perm == 'delete' || $perm == 'all') {
        $this->exec('UPDATE collectionRole'
          . ' SET canDelete = ' . ($grant ? 'TRUE' : 'FALSE')
          . ' WHERE roleId = @roleId'
          . ' AND collectionId = @collectionId');
      }
    }

    function getApps() {
      return $this->queryEnumeratedArray('SELECT name FROM app');
    }

    function listAppConfiguration($appId) {
      $this->setInteger('appId', $appId);
      $result = new Record();

      $result->roles = $this->query('SELECT * FROM role'
        . ' WHERE appId = @appId');

      $result->users = $this->query('SELECT * FROM user'
        . ' WHERE appId = @appId');
      foreach ($result->users as $user) {
        $this->setInteger('userId', $user->id);
        $user->roles = $this->queryEnumeratedArray('SELECT r.name'
          . ' FROM userRole ur'
          . ' JOIN role r ON r.id = ur.roleId'
          . ' WHERE ur.userId = @userId');
      }

      $result->collections = $this->query('SELECT * FROM collection'
        . ' WHERE appId = @appId');
      foreach ($result->collections as $collection) {
        $this->setInteger('collectionId', $collection->id);
        $collection->roles = $this->query('SELECT r.name, cr.canSelect,'
          . ' cr.canInsert, cr.canUpdate, cr.canDelete'
          . ' FROM collectionRole cr'
          . ' JOIN role r ON r.id = cr.roleId'
          . ' WHERE cr.collectionId = @collectionId');
      }

      return $result;
    }
  }
?>
