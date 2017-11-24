---
template: chapter.pug
title: 'Back End Performance'
chaptertitle: 'How to Optimize SQL Queries for Faster Sites'
chapterauthor: Iain Poulson
---
_This article was originally published on the [Delicious Brains blog](https://deliciousbrains.com/sql-query-optimization/), and is republished here with permission._

You know that a fast site == happier users, improved ranking from Google, and increased conversions. Maybe you even think your WordPress site is as fast as it can be: you've looked at site performance, from the [best practices of setting up a server](https://deliciousbrains.com/hosting-wordpress-setup-secure-virtual-server/), to [troubleshooting slow code](https://deliciousbrains.com/finding-bottlenecks-wordpress-code/), and [offloading your images to a CDN](https://deliciousbrains.com/wp-offload-s3/doc/why-use-a-cdn/), but is that everything?

With dynamic, database-driven websites like WordPress, you might still have one problem on your hands: database queries slowing down your site.

In this post, I’ll take you through how to identify the queries causing bottlenecks, how to understand the problems with them, along with quick fixes and other approaches to speed things up. I’ll be using an actual query we recently tackled that was slowing things down on the customer portal of [deliciousbrains.com](https://deliciousbrains.com).

## Identification

The first step in fixing slow SQL queries is to find them. Ashley has [sung the praises](https://deliciousbrains.com/finding-bottlenecks-wordpress-code/#query-monitor) of the debugging plugin [Query Monitor](https://wordpress.org/plugins/query-monitor/) on the blog before, and it’s the database queries feature of the plugin that really makes it an invaluable tool for identifying slow SQL queries. The plugin reports on all the database queries executed during the page request. It allows you to filter them by the code or component (the plugin, theme or WordPress core) calling them, and highlights duplicate and slow queries:

![Query Monitor results](../images/1510526259query_monitor-1440x494-1024x351.png)

If you don’t want to install a debugging plugin on a production site (maybe you’re worried about adding some performance overhead) you can opt to turn on the [MySQL Slow Query Log](https://dev.mysql.com/doc/refman/5.7/en/slow-query-log.html), which logs all queries that take a certain amount of time to execute. This is relatively simple to [configure](https://www.a2hosting.co.uk/kb/developer-corner/mysql/enabling-the-slow-query-log-in-mysql) and [set up](https://dev.mysql.com/doc/refman/5.7/en/log-destinations.html) where to log the queries to. As this is a server-level tweak, the performance hit will be less that a debugging plugin on the site, but should be turned off when not using it.

## Understanding

Once you have found an expensive query that you want to improve, the next step is to try to understand what is making the query slow. Recently during development to our site, we found a query that was taking around 8 seconds to execute!

```sql
SELECT
l.key_id,
    l.order_id,
    l.activation_email,
    l.licence_key,
    l.software_product_id,
    l.software_version,
    l.activations_limit,
    l.created,
    l.renewal_type,
    l.renewal_id,
    l.exempt_domain,
    s.next_payment_date,
    s.status,
    pm2.post_id AS 'product_id',
    pm.meta_value AS 'user_id'
FROM
    oiz6q8a_woocommerce_software_licences l
        INNER JOIN
    oiz6q8a_woocommerce_software_subscriptions s ON s.key_id = l.key_id
        INNER JOIN
    oiz6q8a_posts p ON p.ID = l.order_id
        INNER JOIN
    oiz6q8a_postmeta pm ON pm.post_id = p.ID
        AND pm.meta_key = '_customer_user'
        INNER JOIN
    oiz6q8a_postmeta pm2 ON pm2.meta_key = '_software_product_id'
        AND pm2.meta_value = l.software_product_id
WHERE
    p.post_type = 'shop_order'
        AND pm.meta_value = 279
ORDER BY s.next_payment_date
```

We use WooCommerce and a customized version of the WooCommerce Software Subscriptions plugin to run our plugins store. The purpose of this query is to get all subscriptions for a customer where we know their customer number. WooCommerce has a somewhat complex data model, in that even though an order is stored as a custom post type, the id of the customer (for stores where each customer gets a WordPress user created for them) is not stored as the `post_author`, but instead as a piece of post meta data. There are also a couple of joins to custom tables created by the software subscriptions plugin. Let’s dive in to understand the query more.

### MySQL is your Friend

MySQL has a handy statement [`DESCRIBE`](https://dev.mysql.com/doc/refman/5.7/en/describe.html) which can be used to output information about a table’s structure such as its columns, data types, defaults. So if you execute `DESCRIBE wp_postmeta;` you will see the following results:

<table>

<thead>

<tr>

<th>Field</th>

<th>Type</th>

<th>Null</th>

<th>Key</th>

<th>Default</th>

<th>Extra</th>

</tr>

</thead>

<tbody>

<tr>

<td>meta_id</td>

<td>bigint(20) unsigned</td>

<td>NO</td>

<td>PRI</td>

<td>NULL</td>

<td>auto_increment</td>

</tr>

<tr>

<td>post_id</td>

<td>bigint(20) unsigned</td>

<td>NO</td>

<td>MUL</td>

<td>0</td>

</tr>

<tr>

<td>meta_key</td>

<td>varchar(255)</td>

<td>YES</td>

<td>MUL</td>

<td>NULL</td>

</tr>

<tr>

<td>meta_value</td>

<td>longtext</td>

<td>YES</td>

<td>NULL</td>

</tr>

</tbody>

</table>

That’s cool, but you may already know about it. But did you know that the `DESCRIBE` statement prefix can actually be used on `SELECT`, `INSERT`, `UPDATE`, `REPLACE` and `DELETE` statements? This is more commonly known by its synonym [`EXPLAIN`](https://dev.mysql.com/doc/refman/5.7/en/explain.html) and will give us detailed information about how the statement will be executed.

Here are the results for our slow query:

<table>

<thead>

<tr>

<th>id</th>

<th>select_type</th>

<th>table</th>

<th>type</th>

<th>possible_keys</th>

<th>key</th>

<th>key_len</th>

<th>ref</th>

<th>rows</th>

<th>Extra</th>

</tr>

</thead>

<tbody>

<tr>

<td>1</td>

<td>SIMPLE</td>

<td>pm2</td>

<td>ref</td>

<td>meta_key</td>

<td>meta_key</td>

<td>576</td>

<td>const</td>

<td>28</td>

<td>Using where; Using temporary; Using filesort</td>

</tr>

<tr>

<td>1</td>

<td>SIMPLE</td>

<td>pm</td>

<td>ref</td>

<td>post_id,meta_key</td>

<td>meta_key</td>

<td>576</td>

<td>const</td>

<td>37456</td>

<td>Using where</td>

</tr>

<tr>

<td>1</td>

<td>SIMPLE</td>

<td>p</td>

<td>eq_ref</td>

<td>PRIMARY,type_status_date</td>

<td>PRIMARY</td>

<td>8</td>

<td>deliciousbrainsdev.pm.post_id</td>

<td>1</td>

<td>Using where</td>

</tr>

<tr>

<td>1</td>

<td>SIMPLE</td>

<td>l</td>

<td>ref</td>

<td>PRIMARY,order_id</td>

<td>order_id</td>

<td>8</td>

<td>deliciousbrainsdev.pm.post_id</td>

<td>1</td>

<td>Using index condition; Using where</td>

</tr>

<tr>

<td>1</td>

<td>SIMPLE</td>

<td>s</td>

<td>eq_ref</td>

<td>PRIMARY</td>

<td>PRIMARY</td>

<td>8</td>

<td>deliciousbrainsdev.l.key_id</td>

<td>1</td>

<td>NULL</td>

</tr>

</tbody>

</table>

At first glance, this isn’t very easy to interpret. Luckily the folks over at SitePoint have put together a [comprehensive guide to understanding the statement](https://www.sitepoint.com/using-explain-to-write-better-mysql-queries/).

The most important column is `type`, which describes how the tables are joined. If you see `ALL` then that means MySQL is reading the whole table from disk, increasing I/O rates and putting load on the CPU. This is know as a “full table scan” (more on that later).

The `rows` column is also a good indication of what MySQL is having to do, as this shows how many rows it has looked in to find a result.

`Explain` also gives us more information we can use to optimize. For example, the pm2 table (wp_postmeta), it is telling us we are `Using filesort`, because we are asking the results to be sorted using an `ORDER BY` clause on the statement. If we were also grouping the query we would be adding overhead to the execution.

### Visual Investigation

[MySQL Workbench](https://www.mysql.com/products/workbench/) is another handy, free tool for this type of investigation. For databases running on MySQL 5.6 and above, the results of `EXPLAIN` can be outputted as JSON, and MySQL Workbench turns that JSON into a visual execution plan of the statement:

![MySQl Workbench Visual Results](../images/1510526322mysql_workbench_visual-1440x922-1024x656.png)

It automatically draws your attention to issues by coloring parts of the query by cost. We can see straight away that join to the `wp_woocommerce_software_licences` (alias l) table has a serious issue.

## Solving

That part of the query is performing a full table scan, which you [should try to avoid](https://dev.mysql.com/doc/refman/5.7/en/table-scan-avoidance.html), as it uses a non-indexed column `order_id` as the join between the `wp_woocommerce_software_licences` table to the `wp_posts` table. This is a common issue for slow queries and one that can be solved easily.

### Indexes

`order_id` is a pretty important piece of identifying data in the table, and if we are querying like this we really should have an [index](https://dev.mysql.com/doc/refman/5.7/en/mysql-indexes.html) on the column, otherwise MySQL will literally scan each row of the table until it finds the rows needed. Let’s add an index and see what that does:

```sql
CREATE INDEX order_id ON wp_woocommerce_software_licences(order_id)
```

![SQL results with index](../images/1510526377index_results-1024x75.png)

Wow, we’ve managed to shave over 5 seconds off the query by adding that index, good job!

### Know your Query

Examine the query --- join by join, subquery by subquery. Does it do things it doesn’t need to? Can optimizations be made?

In this case we join the licenses table to the posts table using the `order_id`, all the while restricting the statement to post types of `shop_order`. This is to enforce data integrity to make sure we are only using the correct order records. However, it is actually a redundant part of the query. We know that it’s a safe bet that a software license row in the table has an `order_id` relating to the WooCommerce order in the posts table, as this is enforced in PHP plugin code. Let’s remove the join and see if that improves things:

![Query results without redundant join](../images/1510526429redundant_results-1440x90-1024x64.png)

That’s not a huge saving, but the query is now under 3 seconds.

### Cache All The Things!

If your server doesn’t have [MySQL query caching](https://dev.mysql.com/doc/refman/5.7/en/query-cache.html) on by default then it is worth turning on. This means MySQL will keep a record of all statements executed with the result, and if an identical statement is subsequently executed the cached results are returned. The cache doesn’t get stale, as MySQL flushes the cache when tables are changed.

Query Monitor found our query to be running 4 times on a single page load, and although it’s good to have MySQL query caching on, duplicate reads to the database in one request should really be avoided full stop. Static caching in your PHP code is a simple and very effective way to solve this issue. Basically you are fetching the results of a query from the database the first time it is requested and storing them in static property of a class, and then subsequent calls will return the results from the static property:

```php
class WC_Software_Subscription {

    protected static $subscriptions = array();

    public static function get_user_subscriptions( $user_id ) {
        if ( isset( static::$subscriptions[ $user_id ] ) ) {
            return static::$subscriptions[ $user_id ];
        }

        global $wpdb;

        $sql = '...';

        $results = $wpdb->get_results( $sql, ARRAY_A );

        static::$subscriptions[ $user_id ] = $results;

        return $results;
    }
}
```

The cache has a lifespan of the request, more specifically that of the instantiated object. If you are looking at persisting query results across requests, then you would need to implement a persistent [Object Cache](https://codex.wordpress.org/Class_Reference/WP_Object_Cache). However, your code would need to be responsible for setting the cache, and invalidating the cache entry when the underlying data changes.

### Thinking Outside the Box

There are other approaches we can take to try and speed up query execution that involve a bit more work than just tweaking the query or adding an index. One of the slowest parts of our query is the work done to join the tables to go from customer id to product id, and we have to do this for every customer. What if we did all that joining just once, so we could just grab the customer’s data when we need it?

You could denormalize the data by creating a table that stores the license data, along with the user id and product id for all licenses and just query against that for a specific customer. You would need to rebuild the table using [MySQL triggers](https://dev.mysql.com/doc/refman/5.7/en/create-trigger.html) on `INSERT/UPDATE/DELETE` to the licenses table (or others depending on how the data could change) but this would significantly improve the performance of querying that data.

Similarly, if a number of joins slow down your query in MySQL, it might be quicker to break the query into two or more statements and execute them separately in PHP and then collect and filter the results in code. Laravel does something similar by [eager loading](https://laravel.com/docs/5.5/eloquent-relationships#eager-loading) relationships in Eloquent.

WordPress can be prone to slower queries on the `wp_posts` table, if you have a large amount of data, and many different custom post types. If you are finding querying for your post type slow, then consider moving away from the custom post type storage model and to a [custom table](https://deliciousbrains.com/creating-custom-table-php-wordpress/).

## Results

With these approaches to query optimization we managed to take our query down from 8 seconds down to just over 2 seconds, and reducing the amount of times it was called from 4 to 1\. As a note, those query times were recorded when running on our development environment and would be quicker on production.

I hope this has been a helpful guide to tracking down slow queries and fixing them up. Query optimization might seem like a scary task, but as soon as you try it out and have some quick wins you’ll start to get the bug and want to improve things even further.
