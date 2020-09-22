CREATE DATABASE `mysql` /*!40100 DEFAULT CHARACTER SET utf8 */;

USE `mysql`

CREATE TABLE `app` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` tinytext,
  PRIMARY KEY (`id`),
  KEY `name` (`name`(32))
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8

CREATE TABLE `collection` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` tinytext,
  `appId` int(10) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `appCollection` (`appId`,`name`(32))
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8

CREATE TABLE `collectionRole` (
  `collectionId` int(10) unsigned NOT NULL,
  `roleId` int(10) unsigned NOT NULL,
  `canSelect` tinyint(1) DEFAULT NULL,
  `canInsert` tinyint(1) DEFAULT NULL,
  `canUpdate` tinyint(1) DEFAULT NULL,
  `canDelete` tinyint(1) DEFAULT NULL,
  KEY `collectionId` (`collectionId`,`roleId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8

CREATE TABLE `item` (
  `id` varchar(20) NOT NULL,
  `collectionId` int(10) unsigned NOT NULL,
  `content` text,
  PRIMARY KEY (`collectionId`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8

CREATE TABLE `role` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` tinytext,
  `appId` int(10) unsigned NOT NULL,
  `developer` binary(1) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `appUser` (`appId`,`name`(32))
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8

CREATE TABLE `session` (
  `id` varchar(20) NOT NULL,
  `userId` int(10) unsigned NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8

CREATE TABLE `user` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` tinytext,
  `password` tinytext,
  `appId` int(10) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `appUser` (`appId`,`name`(32))
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8

CREATE TABLE `userRole` (
  `userId` int(10) unsigned NOT NULL,
  `roleId` int(10) unsigned NOT NULL,
  PRIMARY KEY (`userId`,`roleId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8

