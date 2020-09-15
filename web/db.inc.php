<?php // db.inc.php
  class Record {
  }

  class Db {
    var $sessionId;
    var $connection;

    function __construct($sessionId) {
      $this->sessionId = $sessionId;

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

      $this->setString('sessionId', $this->sessionId);
    }

    function newId() {
      return str_replace('/', '_', base64_encode(random_bytes(15)));
    }

    function exec($sql) {
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
//print "$sql\n";
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
//print "$sql\n";
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
      $this->set($name, 'i', $value);
    }

    function setString($name, $value) {
      $this->set($name, 's', $value);
    }

    function setDouble($name, $value) {
      $this->set($name, 'd', $value);
    }

    function setBinary($name, $value) {
      $this->set($name, 'b', $value);
    }

    function getSessionId($app, $user, $password) {
      $this->setString('app', $app);
      $this->setString('user', $user);
      $this->setString('password', $password);

      $userId = $this->queryScalar('SELECT @userId := user.id'
        . ' FROM app'
        . ' JOIN user ON user.appId = app.id'
        . ' WHERE app.name = @app'
        . ' AND user.name = @user'
        . ' AND user.password = PASSWORD(@password)');

      if ($userId === false) {
        return false;
      }

      while (true) {
        $newId = $this->newId();
        $this->setString('sessionId', $newId);
        $c = $this->queryScalar('SELECT COUNT(*) FROM session'
          . ' WHERE id = @sessionId');
        if ($c == 0) {
          $this->exec('INSERT INTO session'
            . ' (id, userId)'
            . ' VALUES'
            . ' (@sessionId, @userId)');
          $this->sessionId = $newId;
          return $newId;
        }
      }
    }

    function canInsert($collection) {
      $this->setString('name', $collection);

      $c = $this->queryScalar('SELECT COUNT(*)'
        . ' FROM session s'
        . ' JOIN userRole ur ON ur.userId = s.userId'
        . ' JOIN collectionRole cr ON cr.roleId = ur.roleId'
        . ' JOIN collection c ON c.id = cr.collectionId'
        . ' WHERE s.id = @sessionId'
        . ' AND c.name = @name'
        . ' AND cr.canInsert');

      return ($c > 0);
    }

    function canUpdate($collection) {
      $this->setString('name', $collection);

      $c = $this->queryScalar('SELECT COUNT(*)'
        . ' FROM session s'
        . ' JOIN userRole ur ON ur.userId = s.userId'
        . ' JOIN collectionRole cr ON cr.roleId = ur.roleId'
        . ' JOIN collection c ON c.id = cr.collectionId'
        . ' WHERE s.id = @sessionId'
        . ' AND c.name = @name'
        . ' AND cr.canUpdate');

      return ($c > 0);
    }

    function canDelete($collection) {
      $this->setString('name', $collection);

      $c = $this->queryScalar('SELECT COUNT(*)'
        . ' FROM session s'
        . ' JOIN userRole ur ON ur.userId = s.userId'
        . ' JOIN collectionRole cr ON cr.roleId = ur.roleId'
        . ' JOIN collection c ON c.id = cr.collectionId'
        . ' WHERE s.id = @sessionId'
        . ' AND c.name = @name'
        . ' AND cr.canDelete');

      return ($c > 0);
    }

    function isDeveloper() {
      $c = $this->queryScalar('SELECT COUNT(*)'
        . ' FROM session s'
        . ' JOIN userRole ur ON ur.userId = s.userId'
        . ' JOIN role r ON r.id = ur.roleId'
        . ' WHERE s.id = @sessionId'
        . ' AND r.developer = TRUE');

      return ($c > 0);
    }

    function getCollectionId($name) {
      $this->setString('name', $name);
      $collectionId = $this->queryScalar('SELECT c.id'
        . ' FROM session s'
        . ' JOIN user u ON u.id = s.userId'
        . ' JOIN collection c ON c.appId = u.appId'
        . ' WHERE s.id = @sessionId'
        . ' AND c.name = @name');

//print 'Session id: ' . $this->queryScalar('SELECT @sessionId') . "\n";
//print 'Name: ' . $this->queryScalar('SELECT @name') . "\n";

      if ($collectionId !== false) {
//print "Returning because not false\n";
        return $collectionId;
      } else {
        // Does this user have permission to create the collection?
        if ($this->isDeveloper()) {
//print "User can create collection\n";
          $collectionId = $this->exec('INSERT INTO collection'
            . ' (name, appId)'
            . ' SELECT @name, u.appId'
            . ' FROM session s'
            . ' JOIN user u ON u.id = s.userId'
            . ' WHERE s.id = @sessionId');

          $this->setInteger('collectionId', $collectionId);

          // Developer roles automatically get full access to collections
          $this->exec('INSERT INTO collectionRole'
            . ' (collectionId, roleId)'
            . ' SELECT @collectionId, r.id'
            . ' FROM session s'
            . ' JOIN user u ON u.id = s.userId'
            . ' JOIN role r ON r.appId = u.appId'
            . ' WHERE r.developer = TRUE');

          return $collectionId;
        } else {
//print "User cannot create collection: '$name'\n";
        }
      }
    }

    function getCollections() {
      return $this->queryAssociativeArray('SELECT c.name, c.id'
        . ' FROM session s'
        . ' JOIN user u ON u.id = s.userId'
        . ' JOIN collection c ON c.appId = u.appId'
        . ' WHERE s.id = @sessionId'
        . ' AND EXISTS(SELECT *'
        .   ' FROM userRole ur'
        .   ' JOIN collectionRole cr ON cr.roleId = ur.roleId'
        .   ' WHERE ur.userId = u.id'
        .   ' AND cr.collectionId = c.id'
        .   ' AND cr.canSelect = TRUE)');
    }

    function getItems($collectionId) {
      $this->setInteger('collectionId', $collectionId);

      return $this->queryAssociativeArray('SELECT i.id, i.content'
        . ' FROM item i'
        . ' WHERE collectionId = @collectionId');
    }

    function updateItem($collectionId, $itemId, $content) {
      $this->setInteger('collectionId', $collectionId);
      $this->setString('itemId', $itemId);
      $this->setString('content', $content);

      $this->exec('INSERT INTO item'
        . ' (id, collectionId, content)'
        . ' VALUES (@itemId, @collectionId, @content)'
        . ' ON DUPLICATE KEY UPDATE content = @content');
    }

    function deleteItem($collectionId, $itemId) {
      $this->setInteger('collectionId', $collectionId);
      $this->setString('itemId', $itemId);

      $this->exec('DELETE FROM item'
        . ' WHERE id = @itemId'
        . ' AND collectionId = @collectionId');
    }

    function appPermissions() {
      $record = new Record();
      $record->developer = $this->isDeveloper();
      return $record;
    }

    function collectionPermissions() {
      return $this->query('SELECT'
        . ' c.name, MAX(cr.canInsert) AS canInsert,'
        . ' MAX(cr.canUpdate) AS canUpdate,'
        . ' MAX(cr.canDelete) AS canDelete,'
        . ' MAX(cr.canSelect) AS canSelect'
        . ' FROM session s'
        . ' JOIN userRole ur ON ur.userId = s.userId'
        . ' JOIN collectionRole cr ON cr.roleId = ur.roleId'
        . ' JOIN collection c ON c.id = cr.collectionId'
        . ' WHERE s.id = @sessionId'
        . ' GROUP BY c.name');
    }
  }
?>
