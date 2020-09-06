<html>
  <body>
    <?php
      foreach (glob("test*.html") as $test) {
        if (strlen($test) == 12) {
          print "<a href=\"$test\">$test</a><br />";
        }
      }
    ?>
  </body>
</html>
