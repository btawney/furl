<?php // auth.php
  require_once('db.inc.php');

  if (count($argv) > 1) {
    $body = $argv[1];
  } else {
    $body = file_get_contents('php://input');
  }

  // Reject anything over 1MB as suspicious
  if (strlen($body) > 1000000) {
    print "{\"result\":9091348}";
    return;
  }

  try {
    $message = json_decode($body, true);
    $db = new Db('');

    $sessionId = $db->getSessionId(
      $message['app'],
      $message['user'],
      $message['password']);

    if ($sessionId === false) {
      print '{"result":"failure","sessionId":""}';
      return;
    } else {
      print "{\"result\":\"success\",\"sessionId\":\"$sessionId\",\n";

      print "\"permissions\":{\n";
      print "\"app\":\n";

      print json_encode($db->appPermissions());

      print ",\n"; // End app permissions
      print "\"collections\":{\n";

      $firstCollection = true;
      foreach ($db->collectionPermissions() as $row) {
        if ($firstCollection) {
          $firstCollection = false;
        } else {
          print ",\n";
        }

        print "\"$row->name\":{\n";
        print '"canSelect":' . ($row->canSelect > 0 ? 'true' : 'false')
          . ",\n";
        print '"canInsert":' . ($row->canInsert > 0 ? 'true' : 'false')
          . ",\n";
        print '"canUpdate":' . ($row->canUpdate > 0 ? 'true' : 'false')
          . ",\n";
        print '"canDelete":' . ($row->canDelete > 0 ? 'true' : 'false');
        print "}";
      }

      print "\n}\n"; // End collections permissions
      print "},\n"; // end permissions

      print "\"collections\":{\n";

      $firstCollection = true;
      foreach ($db->getCollections() as $name => $id) {
        if ($firstCollection) {
          $firstCollection = false;
        } else {
          print ",\n";
        }

        print "\"$name\":{\n";

        $firstItem = true;
        foreach ($db->getItems($id) as $itemId => $content) {
          if ($firstItem) {
            $firstItem = false;
          } else {
            print ",\n";
          }
          print "\"$itemId\":$content\n";
        }
        print "}\n";
      }

      print "}}\n";
      
      return;
    }
  } catch (Exception $inner) {
    print "{\"result\":9081332, \"inner\":\"$inner\"}";
    return;
  }

  print '{"result":9091347}';
?>
