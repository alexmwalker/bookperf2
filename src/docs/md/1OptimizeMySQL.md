---
template: chapter.pug
title: 'Back End Performance'
chaptertitle: 'How to Optimize MySQL: Indexes, Slow Queries, Configuration'
chapterauthor: Bruno Škvorc
---

MySQL is still the world's most popular relational database, and yet, it's still the most unoptimized - many people leave it at default values, not bothering to investigate further. In this article, we'll look at some MySQL optimization tips we've covered previously, and combine them with novelties that came out since.

## Configuration Optimization

The first - and most skipped! - performance upgrade every user of MySQL should do is tweak the configuration. 5.7 (the current version) has much better defaults than its predecessors, but it's still easy to make improvements on top of those.

We'll assume you're using a Linux-based host or a good [Vagrant](http://www.sitepoint.com/re-introducing-vagrant-right-way-start-php/) box like our [Homestead Improved](http://www.sitepoint.com/quick-tip-get-homestead-vagrant-vm-running/) so your configuration file will be in `/etc/mysql/my.cnf`. It's possible that your installation will actually load a secondary configuration file into that configuration file, so look into that - if the `my.cnf` file doesn't have much content, the file `/etc/mysql/mysql.conf.d/mysqld.cnf` might.

### Editing Configuration

You'll need to be comfortable with using the command line. Even if you haven't been exposed to it yet, now is as good a time as any.

If you're editing locally on a Vagrant box, you can copy the file out into the main filesystem by copying it into the shared folder with `cp /etc/mysql/my.cnf /home/vagrant/Code` and editing it with a regular text editor, then copying it back into place when done. Otherwise, use a simple text editor like vim by executing `sudo vim /etc/mysql/my.cnf`.

_Note: modify the above path to match the config file's real location - it's possible that it's actually in `/etc/mysql/mysql.conf.d/mysqld.cnf`_

### Manual Tweaks

The following manual tweaks should be made out of the box. As per [these tips](https://www.percona.com/blog/2016/10/12/mysql-5-7-performance-tuning-immediately-after-installation/), add this to the config file under the `[mysqld]` section:

```cnf
innodb_buffer_pool_size = 1G # (adjust value here, 50%-70% of total RAM)
innodb_log_file_size = 256M
innodb_flush_log_at_trx_commit = 1 # may change to 2 or 0
innodb_flush_method = O_DIRECT
```

*   `innodb_buffer_pool_size` - the buffer pool is a storage area for caching data and indexes in memory. It's used to keep frequently accessed data in memory, and when you're running a dedicated or virtual server where the DB will often be the bottleneck, it makes sense to give this part of your app(s) the most RAM. Hence, we give it 50-70% of all RAM. There's a buffer pool sizing guide available in the [MySQL docs](https://dev.mysql.com/doc/refman/5.7/en/innodb-buffer-pool-resize.html).
*   the log file size is well explained [here](https://www.percona.com/blog/2016/05/31/what-is-a-big-innodb_log_file_size/) but in a nutshell it's how much data to store in a log before wiping it. Note that a log in this case is not an error log or something you might be used to, but instead it indicates checkpoint time because with MySQL, writes happen in the background but still affect foreground performance. Big log files mean better performance because of fewer new and smaller checkpoints being created, but longer recovery time in case of a crash (more stuff needs to be re-written to the DB).
*   `innodb_flush_log_at_trx_commit` is explained [here](https://dev.mysql.com/doc/refman/5.7/en/innodb-parameters.html#sysvar_innodb_flush_log_at_trx_commit) and indicates what happens with the log file. With 1 we have the safest setting, because the log is flushed to disk after every transaction. With 0 or 2 it's less ACID, but more performant. The difference in this case isn't big enough to outweigh the stability benefits of the setting of 1.
*   `innodb_flush_method` - to top things off in regards to flushing, this gets set to `O_DIRECT` to avoid double-buffering. This should always be done, unless the I/O system is very low performance. On most hosted servers like DigitalOcean droplets you'll have SSDs, so the I/O system will be high performance.

There's another tool from Percona which can help us find the remaining problems automatically. Note that if we had run it without the above manual tweaks, only 1 out of 4 fixes would have been manually identified because the other 3 depend on user preference and the app's environment.

![Superhero speeding](../images/1509294383superhero-534120_1280.jpg)

### Variable Inspector

To install the variable inspector on Ubuntu:

```bash
wget https://repo.percona.com/apt/percona-release_0.1-4.$(lsb_release -sc)_all.deb
sudo dpkg -i percona-release_0.1-4.$(lsb_release -sc)_all.deb
sudo apt-get update
sudo apt-get install percona-toolkit
```

For other systems, follow [instructions](https://www.percona.com/downloads/percona-toolkit/LATEST/).

Then, run the toolkit with:

```bash
pt-variable-advisor h=localhost,u=homestead,p=secret
```

You should see output not unlike this one:

```
# WARN delay_key_write: MyISAM index blocks are never flushed until necessary.

# NOTE max_binlog_size: The max_binlog_size is smaller than the default of 1GB.

# NOTE sort_buffer_size-1: The sort_buffer_size variable should generally be left at its default unless an expert determines it is necessary to change it.

# NOTE innodb_data_file_path: Auto-extending InnoDB files can consume a lot of disk space that is very difficult to reclaim later.

# WARN log_bin: Binary logging is disabled, so point-in-time recovery and replication are not possible.
```

None of these are critical, they don't need to be fixed. The only one we could add would be binary logging for replication and snapshot purposes.

_Note: the binlog size will default to 1G in newer versions and won't be noted by PT._

```cnf
max_binlog_size = 1G
log_bin = /var/log/mysql/mysql-bin.log
server-id=master-01
binlog-format = 'ROW'
```

*   the `max_binlog_size` setting determined how large binary logs will be. These are logs that log your transactions and queries and make checkpoints. If a transaction is bigger than max, then a log might be bigger than max when saved to disk - otherwise, MySQL will keep them at that limit.
*   the `log_bin` option enables binary logging altogether. Without it, there's no snapshotting or replication. Note that this can be very strenuous on the disk space. Server ID is a necessary option when activating binary logging, so the logs know which server they came from (for replication) and the format is just the way in which the logs are written.

As you can see, the new MySQL has sane defaults that make things nearly production ready. Of course, every app is different and has additional custom tweaks applicable.

### MySQL Tuner

The [Tuner](https://raw.githubusercontent.com/major/MySQLTuner-perl/master/mysqltuner.pl) will monitor a database in longer intervals (run it once per week or so on a live app) and suggest changes based on what it's seen in the logs.

Install it by simply downloading it:

```bash
wget https://raw.githubusercontent.com/major/MySQLTuner-perl/master/mysqltuner.pl
chmod +x mysqltuner.pl
```

Running it with `./mysqltuner.pl` will ask you for admin username and password for the database, and output information from the quick scan. For example, here's my InnoDB section:

```pl
[--] InnoDB is enabled.
[--] InnoDB Thread Concurrency: 0
[OK] InnoDB File per table is activated
[OK] InnoDB buffer pool / data size: 1.0G/11.2M
[!!] Ratio InnoDB log file size / InnoDB Buffer pool size (50 %): ⤶
    256.0M * 2/1.0G should be equal 25%
[!!] InnoDB buffer pool <= 1G and Innodb_buffer_pool_instances(!=1).
[--] Number of InnoDB Buffer Pool Chunk : 8 for 8 Buffer Pool Instance(s)
[OK] Innodb_buffer_pool_size aligned with Innodb_buffer_pool_chunk_size⤶
 & Innodb_buffer_pool_instances
[OK] InnoDB Read buffer efficiency: 96.65% (19146 hits/ 19809 total)
[!!] InnoDB Write Log efficiency: 83.88% (640 hits/ 763 total)
[OK] InnoDB log waits: 0.00% (0 waits / 123 writes)
```

Again, it's important to note that this tool should be run once per week or so as the server has been running. Once a config value is changed and the server restarted, it should be run a week from that point then. It's a good idea to set up a cronjob to do this for you and send you the results periodically.

* * *

Make sure you restart the mysql server after every configuration change:

```bash
sudo service mysql restart
```
## Indexes

Next up, let's focus on Indexes - the main pain point of many hobbyist DB admins! Especially those who immediately jump into ORMs and are thus never truly exposed to raw SQL.

_Note: the terms keys and indexes can be used interchangeably._

You can compare MySQL indexes with the index in a book which lets you easily find the correct page that contains the subject you're looking for. If there weren’t any indexes, you'd have to go through the whole book searching for pages that contain the subject.

As you can imagine, it’s way faster to search by an index than having to go through each page. Therefore, adding indexes to your database is in general speeding up your select queries. However, the index also has to be created and stored. So the update and insert queries will be slower and it will cost you a bit more disk space. In general, you won’t notice the difference with updating and inserting if you have indexed your table correctly and therefore it’s advisable to add indexes at the right locations.

Tables which only contain a few rows don’t really benefit from indexing. You can imagine that searching through 5 pages is not much slower then first going to the index, getting the page number and then opening that particular page.

So how do we find out which indexes to add, and which types of indexes exist?

### Unique / Primary Indexes

Primary indexes are the main indexes of data which are the default way of addressing them. For a user account, that might be a user ID, or a username, even a main email. Primary indexes are unique. Unique indexes are indexes that cannot be repeated in a set of data.

For example, if a user selected a specific username, no one else should be able to take it. Adding a "unique" index to the `username` column solves this problem. MySQL will complain if someone else tries to insert a row which has a username that already exists.

```sql
...
ALTER TABLE `users`
ADD UNIQUE INDEX `username` (`username`);
...
```

Primary keys/indexes are usually defined on table creation, and unique indexes are defined after the fact by altering the table.

Both primary keys and unique keys can be made on a single column or multiple columns at once. For example, if you want to make sure only one username per country can be defined, you make a unique index on both of those columns, like so:

```sql
    ...
    ALTER TABLE `users`
    ADD UNIQUE INDEX `usercountry` (`username`, `country`),
    ...
```

Unique indexes are put onto columns which you'll address often. So if the user account is frequently requested and you have many user accounts in the database, that's a good use case.

### Regular Indexes

Regular indexes ease lookup. They're very useful when you need to find data by a specific column or combination of columns fast, but that data doesn't need to be unique.

```sql
...
ALTER TABLE `users`
ADD INDEX `usercountry` (`username`, `country`),
...
```

The above would make it faster to search for usernames per country.

Indexes also help with sorting and grouping speed.

### Fulltext Indexes

FULLTEXT indexes are used for full-text searches. Only the InnoDB and MyISAM storage engines support FULLTEXT indexes and only for CHAR, VARCHAR, and TEXT columns.

These indexes are very useful for all the text searching you might need to do. Finding words inside of bodies of text is FULLTEXT's specialty. Use these on posts, comments, descriptions, reviews, etc. if you often allow searching for them in your application.

### Descending Indexes

Not a special type, but an alteration. From version 8+, MySQL supports [Descending indexes](https://dev.mysql.com/doc/refman/8.0/en/descending-indexes.html), which means it can store indexes in descending order. This can come in handy when you have enormous tables that frequently need the last added data first, or prioritize entries that way. Sorting in descending order was always possible, but came at a small performance penalty. This further speeds things up.

```sql
CREATE TABLE t (
    c1 INT, c2 INT,
    INDEX idx1 (c1 ASC, c2 ASC),
    INDEX idx2 (c1 ASC, c2 DESC),
    INDEX idx3 (c1 DESC, c2 ASC),
    INDEX idx4 (c1 DESC, c2 DESC)
);
```

Consider applying DESC to an index when dealing with logs written in the database, posts and comments which are loaded last to first, and similar.

### Helper Tools: Explain

When looking at optimizing queries, the EXPLAIN tool will be priceless. Prefixing a simple query with `EXPLAIN` will process it in a very in-depth manner, analyze indexes in use, and show you the ratio of hits and misses. You'll notice how many rows it had to process to get the results you're looking for.

```sql
EXPLAIN SELECT City.Name FROM City
JOIN Country ON (City.CountryCode = Country.Code)
WHERE City.CountryCode = 'IND' AND Country.Continent = 'Asia'
```

You can further extend this with `EXTENDED`:

```sql
EXPLAIN SELECT City.Name FROM City
JOIN Country ON (City.CountryCode = Country.Code)
WHERE City.CountryCode = 'IND' AND Country.Continent = 'Asia'
```

See how to use this and apply the discoveries by reading [this excellent, detailed post](https://www.sitepoint.com/using-explain-to-write-better-mysql-queries/).

### Helper Tools: Percona for Duplicate Indexes

The previously installed Percona Toolkit also has a tool for detecting duplicate indexes, which can come in handy when using third party CMSes or just checking if you accidentally added more indexes than needed. For example, the default WordPress installation has duplicate indexes in the `wp_posts` table:

```bash

pt-duplicate-key-checker h=localhost,u=homestead,p=secret

# ########################################################################
# homestead.wp_posts
# ########################################################################

# Key type_status_date ends with a prefix of the clustered index
# Key definitions:
#   KEY `type_status_date` (`post_type`,`post_status`,`post_date`,`ID`),
#   PRIMARY KEY (`ID`),
# Column types:
#      `post_type` varchar(20) collate utf8mb4_unicode_520_ci not null ⤶
#         default 'post'
#      `post_status` varchar(20) collate utf8mb4_unicode_520_ci not null ⤶
#        default 'publish'
#      `post_date` datetime not null default '0000-00-00 00:00:00'
#      `id` bigint(20) unsigned not null auto_increment
# To shorten this duplicate clustered index, execute:
ALTER TABLE `homestead`.`wp_posts` DROP INDEX `type_status_date`, ADD INDEX ⤶
`type_status_date` (`post_type`,`post_status`,`post_date`);

```

As you can see by the last line, it also gives you advice on how to get rid of the duplicate indexes.

### Helper Tools: Percona for Unused Indexes

Percona can also detect unused indexes. If you're logging slow queries (see the Bottlenecks section below), you can run the tool and it'll inspect if these logged queries are using the indexes in the tables involved with the queries.

```bash
pt-index-usage /var/log/mysql/mysql-slow.log
```

For detailed usage of this tool, see [here](https://www.percona.com/doc/percona-toolkit/LATEST/pt-index-usage.html).

## Bottlenecks

This section will explain how to detect and monitor for bottlenecks in a database.

```cnf
slow_query_log  = /var/log/mysql/mysql-slow.log
long_query_time = 1
log-queries-not-using-indexes = 1
```

The above should be added to the configuration. It'll monitor queries that are longer than 1 second, and those not using indexes.

Once this log has some data, you can analyze it for index usage with the aforementioned `pt-index-usage` tool, or the `pt-query-digest` tool which produces results like these:

```bash
pt-query-digest /var/log/mysql/mysql-slow.log

# 360ms user time, 20ms system time, 24.66M rss, 92.02M vsz
# Current date: Thu Feb 13 22:39:29 2014
# Hostname: *
# Files: mysql-slow.log
# Overall: 8 total, 6 unique, 1.14 QPS, 0.00x concurrency ________________
# Time range: 2014-02-13 22:23:52 to 22:23:59
# Attribute          total     min     max     avg     95%  stddev  median
# ============     ======= ======= ======= ======= ======= ======= =======
# Exec time            3ms   267us   406us   343us   403us    39us   348us
# Lock time          827us    88us   125us   103us   119us    12us    98us
# Rows sent             36       1      15    4.50   14.52    4.18    3.89
# Rows examine          87       4      30   10.88   28.75    7.37    7.70
# Query size         2.15k     153     296  245.11  284.79   48.90  258.32
# ==== ================== ============= ===== ====== ===== ===============
# Profile
# Rank Query ID           Response time Calls R/Call V/M   Item
# ==== ================== ============= ===== ====== ===== ===============
#    1 0x728E539F7617C14D  0.0011 41.0%     3 0.0004  0.00 SELECT blog_article
#    2 0x1290EEE0B201F3FF  0.0003 12.8%     1 0.0003  0.00 SELECT portfolio_item
#    3 0x31DE4535BDBFA465  0.0003 12.6%     1 0.0003  0.00 SELECT portfolio_item
#    4 0xF14E15D0F47A5742  0.0003 12.1%     1 0.0003  0.00 SELECT portfolio_category
#    5 0x8F848005A09C9588  0.0003 11.8%     1 0.0003  0.00 SELECT blog_category
#    6 0x55F49C753CA2ED64  0.0003  9.7%     1 0.0003  0.00 SELECT blog_article
# ==== ================== ============= ===== ====== ===== ===============
# Query 1: 0 QPS, 0x concurrency, ID 0x728E539F7617C14D at byte 736 ______
# Scores: V/M = 0.00
# Time range: all events occurred at 2014-02-13 22:23:52
# Attribute    pct   total     min     max     avg     95%  stddev  median
# ============ === ======= ======= ======= ======= ======= ======= =======
# Count         37       3
# Exec time     40     1ms   352us   406us   375us   403us    22us   366us
# Lock time     42   351us   103us   125us   117us   119us     9us   119us
# Rows sent     25       9       1       4       3    3.89    1.37    3.89
# Rows examine  24      21       5       8       7    7.70    1.29    7.70
# Query size    47   1.02k     261     262  261.25  258.32       0  258.32
# String:
# Hosts        localhost
# Users        *
# Query_time distribution
#   1us
#  10us
# 100us  ################################################################
#   1ms
#  10ms
# 100ms
#    1s
#  10s+
# Tables
#    SHOW TABLE STATUS LIKE 'blog_article'\G
#    SHOW CREATE TABLE `blog_article`\G
# EXPLAIN /*!50100 PARTITIONS*/
SELECT b0_.id AS id0, b0_.slug AS slug1, b0_.title AS title2, b0_.excerpt AS ⤶
excerpt3, b0_.external_link AS external_link4, b0_.description AS description5, ⤶
b0_.created AS created6, b0_.updated AS updated7 FROM blog_article b0_ ORDER BY⤶ 
b0_.created DESC LIMIT 10
```

If you'd prefer to analyze these logs by hand, you can do so too - but first you need to export the log into a more "analyzable" format. This can be done with:

```bash
mysqldumpslow /var/log/mysql/mysql-slow.log
```

Additional parameters can further filter data and make sure only important things are exported. For example: the top 10 queries sorted by average execution time.

```bash
mysqldumpslow -t 10 -s at /var/log/mysql/localhost-slow.log
```

For other parameters, see the [docs](https://dev.mysql.com/doc/refman/5.7/en/mysqldumpslow.html).

## Conclusion

In this comprehensive MySQL optimization post we looked at various techniques for making MySQL fly. We dealt with configuration optimization, we powered through some indexes, and we got rid of some bottlenecks!
