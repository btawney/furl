<html>
  <head>
    <?php
      $mtime = filemtime('furl.js');
      print "<script src=\"furl.js?v=$mtime\"></script>";
    ?>
  </head>
  <body>
  </body>
</html>
