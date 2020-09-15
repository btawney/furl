<html>
  <body>
    <?php
      foreach (glob("test*.html") as $test) {
        if (strlen($test) == 12) {
          $content = file_get_contents($test);
          if (preg_match('/<title>(.*)<\/title>/i', $content, $matches)) {
            $title = $matches[1];
          } else {
            $title = '';
          }
          print "<a href=\"$test\">$test</a> $title<br />";
        }
      }
    ?>
  </body>
</html>
