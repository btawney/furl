<?php
  require_once('db.inc.php');

  if (count($argv) > 1) {
    $body = $argv[1];
  } else {
    $body = file_get_contents('php://input');
  }

  // Reject anything over 1MB as suspicious
  if (strlen($body) > 1000000) {
    print "{\"result\":9081303}";
    return;
  }

  try {
    $queue = json_decode($body, true);
    $db = new Db($queue['sessionId']);
  } catch (Exception $inner) {
    print "{\"result\":9081332, \"inner\":\"$inner\"}";
    return;
  }

  foreach ($queue['updates'] as $name => $collection) {
    $collectionId = $db->getCollectionId($name);
    $canUpdate = $db->canUpdate($name);

    if (!$canUpdate) {
      continue;
    }

//print "Collection id for $name: $collectionId\n";

    // Check to see if the collection is clean
    $clean = array();
    foreach ($collection as $key => $value) {
      try {
        $encoded = json_encode($value);
        $clean[$key] = $encoded;
      } catch (Exception $inner) {
        print "{\"result\":9091435}";
        return;
      }
    }

    foreach ($clean as $key => $encoded) {
      $db->updateItem($collectionId, $key, $encoded);
    }
  }

  foreach ($queue['deletes'] as $name => $collection) {
    $collectionId = $db->getCollectionId($name);
    $canDelete = $db->canDelete($name);

    if (!$canDelete) {
      continue;
    }

    foreach ($collection as $key => $value) {
      $db->deleteItem($collectionId, $key);
    }
  }

  print 'ok';
?>
