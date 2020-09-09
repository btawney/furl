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
//print "Collection id for $name: $collectionId\n";
    foreach ($collection as $key => $value) {
      $db->updateItem($collectionId, $key, $value);
    }
  }

  foreach ($queue['deletes'] as $name => $collection) {
    $collectionId = $db->getCollectionId($name);

    foreach ($collection as $key => $value) {
      $db->deleteItem($collectionId, $key);
    }
  }

  print 'ok';
?>
