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
      return str_replace('/', '_', base64_encode(random_bytes(6)));
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
        $userCan = $this->queryScalar('SELECT COUNT(*)'
          . ' FROM session s'
          . ' JOIN userRole ur ON ur.userId = s.userId'
          . ' JOIN appRole ar ON ar.roleId = ur.roleId'
          . ' WHERE s.id = @sessionId'
          . ' AND ar.canCreateCollection = TRUE');

        if ($userCan > 0) {
//print "User can create collection\n";
          return $this->exec('INSERT INTO collection'
            . ' (name, appId)'
            . ' SELECT @name, u.appId'
            . ' FROM session s'
            . ' JOIN user u ON u.id = s.userId'
            . ' WHERE s.id = @sessionId');
        } else {
print "User cannot create collection: '$name'\n";
        }
      }
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
  }
?>
