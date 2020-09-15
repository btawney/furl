<?php // furladmin.php
  require_once('db.inc.php');

  $db = new Db();

  $cs = 'ready';
  $currentAppId = -1;
  $currentCollectionId = -1;
  $currentUserId = -1;
  $currentRoleId = -1;

  foreach ($argv as $arg) {
//    print "$cs $arg\n";
    switch ($cs) {
      case 'ready':
        switch ($arg) {
          case 'add':
          case 'remove':
          case 'app':
          case 'user':
          case 'grant':
          case 'revoke':
          case 'collection':
          case 'role':
            $cs = $arg;
            break;
          case 'coll':
            $cs = 'collection';
            break;
          case 'help':
          case '?':
          case '-?':
            print "Usage:\n";
            print "  furladmin.php add app <name>\n";
            print "  furladmin.php app <name> add {user|role|collection} <name>\n";
            print "\n";
            print "  furladmin.php app <name> {user|collection} <name> {add|remove} role <name>\n";
            print "\n";
            print "  furladmin.php app <name> role <name> {grant|revoke} create\n";
            print "  furladmin.php app <name> role <name> collection <name> {grant|revoke} <perm>\n";
            print "    where <perm> ::= {select|insert|update|delete|all}\n";
            exit;
            break;
        }
        break;
      case 'add':
        switch ($arg) {
          case 'app':
          case 'user':
          case 'collection':
          case 'role':
            $cs = 'add ' . $arg;
            break;
          case 'coll':
            $cs = 'add collection';
            break;
          default:
            print "Unexpected argument $argv\n";
            break;
        }
        break;
      case 'remove':
        switch ($arg) {
          case 'app':
          case 'user':
          case 'collection':
          case 'role':
            $cs = 'remove ' . $arg;
            break;
          case 'coll':
            $cs = 'remove collection';
            break;
        }
        break;
      case 'add app':
        $currentAppId = $db->getAppId($arg, true);
        print "App $arg: Id = $currentAppId\n";
        $cs = 'ready';
        break;
      case 'add user':
        if ($currentAppId > 0) {
          $currentUserId = $db->getUserId($currentAppId, $arg, true);
          print "App $arg: Id = $currentUserId\n";
          $cs = 'ready';
        } else {
          print "App not specified\n";
          exit;
        }
        break;
      case 'add collection':
        if ($currentAppId > 0) {
          $currentCollectionId = $db->getCollectionId($arg, true);
          print "$Collection $arg: Id = $currentCollectionId\n";
          $cs = 'ready';
        } else {
          print "App not specified\n";
          exit;
        }
        break;
      case 'add role':
        if ($currentAppId > 0) {
          if ($arg != 'all') {
            $currentRoleId = $db->getRoleId($currentAppId, $arg, true);
            print "Role $arg: Id = $currentRoleId\n";
          } else {
            if ($currentUserId == -1 && $currentCollectionId == -1) {
              print "Meaningless to add 'all' roles to an app\n";
              exit;
            }
            $currentRoleId = 'ALL';
            print "All roles\n";
          }

          if ($currentUserId > 0) {
            $db->addRoleToUser($currentRoleId, $currentUserId);
            print "Role added to user\n";
          }

          if ($currentCollectionId > 0) {
            $db->addRoleToCollection($currentRoleId, $currentCollectionId);
            print "Role added to collection\n";
          }

          $cs = 'ready';
        } else {
          print "App not specified\n";
          exit;
        }
        break;
      case 'app':
        $currentAppId = $db->getAppId($arg, false);
        if ($currentAppId === false) {
          print "Unrecognized app name: $arg\n";
          exit;
        }
        print "App $arg: Id = $currentAppId\n";
        $cs = 'ready';
        break;
      case 'user':
        $currentUserId = $db->getUserId($currentAppId, $arg, false);
        if ($currentUserId === false) {
          print "Unrecognized user name: $arg\n";
          exit;
        }
        print "User $arg: Id = $currentUserId\n";
        $cs = 'ready';
        break;
      case 'collection':
        $currentCollectionId = $db->getCollectionId($currentAppId, $arg, false);
        if ($currentCollectionId === false) {
          print "Unrecognized collection name: $arg\n";
          exit;
        }
        print "Collection $arg: Id = $currentCollectionId\n";
        $cs = 'ready';
        break;
      case 'role':
        $currentRoleId = $db->getRoleId($currentAppId, $arg, false);
        if ($currentRoleId === false) {
          print "Unrecognized role name: $arg\n";
          exit;
        }
        print "Collection $arg: Id = $currentCollectionId\n";
        $cs = 'ready';
        break;
      case 'grant':
        switch (strtolower($arg)) {
          case 'create':
            if ($currentRoleId >= 0) {
              $db->changeCreate($currentRoleId, true);
              print "Granted\n";
            } else {
              print "Need a role to grant permission to\n";
              exit;
            }
            break;
          case 'select':
          case 'insert':
          case 'update':
          case 'delete':
          case 'all':
            if ($currentRoleId >= 0) {
              if ($currentCollectionId >= 0) {
                $db->changeCollectionRolePermission($currentRoleId,
                  $currentCollectionId, strtolower($arg), true);
                print "Granted\n";
              } else {
                print "Need a collection to grant permission on\n";
              }
            } else {
              print "Need a role to grant permission to\n";
            }
            break;
        }
        break;
      case 'revoke':
        switch (strtolower($arg)) {
          case 'create':
            if ($currentRoleId >= 0) {
              $db->changeCreate($currentRoleId, false);
              print "Granted\n";
            } else {
              print "Need a role to revoke permission from\n";
              exit;
            }
            break;
          case 'select':
          case 'insert':
          case 'update':
          case 'delete':
          case 'all':
            if ($currentRoleId >= 0) {
              if ($currentCollectionId >= 0) {
                $db->changeCollectionRolePermission($currentRoleId,
                  $currentCollectionId, strtolower($arg), false);
                print "Revoked\n";
              } else {
                print "Need a collection to revoke permission on\n";
              }
            } else {
              print "Need a role to revoke permission from\n";
            }
            break;
        }
        break;
      default:
        print "Unexpected command parser state: $cs\n";
        break;
    }
  }
?>
