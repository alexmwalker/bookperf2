---
template: chapter.pug
title: 'Back End Performance'
chaptertitle: 'How to Read Big Files with PHP (Without Killing Your Server)'
chapterauthor: Chris Pitt
---

It’s not often that we, as PHP developers, need to worry about memory management. The PHP engine does a stellar job of cleaning up after us, and the web server model of short-lived execution contexts means even the sloppiest code has no long-lasting effects.

There are rare times when we may need to step outside of this comfortable boundary --- like when we're trying to run Composer for a large project on the smallest VPS we can create, or when we need to read large files on an equally small server.

![Fragmented terrain](../images/1509321734fragment-898477_640.jpg)

It’s the latter problem we'll look at in this tutorial.

_The code for this tutorial can be found on [GitHub](https://github.com/sitepoint-editors/sitepoint-performant-reading-of-big-files-in-php)._

## Measuring Success

The only way to be sure we’re making any improvement to our code is to measure a bad situation and then compare that measurement to another after we’ve applied our fix. In other words, unless we know how much a “solution” helps us (if at all), we can’t know if it really is a solution or not.

There are two metrics we can care about. The first is CPU usage. How fast or slow is the process we want to work on? The second is memory usage. How much memory does the script take to execute? These are often inversely proportional --- meaning that we can offload memory usage at the cost of CPU usage, and vice versa.

In an asynchronous execution model (like with multi-process or multi-threaded PHP applications), both CPU and memory usage are important considerations. In traditional PHP architecture, these _generally_ become a problem when either one reaches the limits of the server.

_It's impractical to measure CPU usage inside PHP. If that’s the area you want to focus on, consider using something like `top`, on Ubuntu or macOS. For Windows, consider using the Linux Subsystem, so you can use `top` in Ubuntu._

For the purposes of this tutorial, we’re going to measure memory usage. We’ll look at how much memory is used in “traditional” scripts. We’ll implement a couple of optimization strategies and measure those too. In the end, I want you to be able to make an educated choice.

The methods we’ll use to see how much memory is used are:

```php
// formatBytes is taken from the php.net documentation

memory_get_peak_usage();

function formatBytes($bytes, $precision = 2) {
    $units = array("b", "kb", "mb", "gb", "tb");

    $bytes = max($bytes, 0);
    $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
    $pow = min($pow, count($units) - 1);

    $bytes /= (1 << (10 * $pow));

    return round($bytes, $precision) . " " . $units[$pow];
}
```

We’ll use these functions at the end of our scripts, so we can see which script uses the most memory at one time.

## What Are Our Options?

There are many approaches we could take to read files efficiently. But there are also two likely scenarios in which we could use them. We could want to read and process data all at the same time, outputting the processed data or performing other actions based on what we read. We could also want to transform a stream of data without ever really needing access to the data.

Let’s imagine, for the first scenario, that we want to be able to read a file and create separate queued processing jobs every 10,000 lines. We’d need to keep at least 10,000 lines in memory, and pass them along to the queued job manager (whatever form that may take).

For the second scenario, let’s imagine we want to compress the contents of a particularly large API response. We don’t care what it says, but we need to make sure it’s backed up in a compressed form.

In both scenarios, we need to read large files. In the first, we need to know what the data is. In the second, we don’t care what the data is. Let’s explore these options…

## Reading Files, Line By Line

There are many functions for working with files. Let’s combine a few into a naive file reader:

```php
// from memory.php

function formatBytes($bytes, $precision = 2) {
    $units = array("b", "kb", "mb", "gb", "tb");

    $bytes = max($bytes, 0);
    $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
    $pow = min($pow, count($units) - 1);

    $bytes /= (1 << (10 * $pow));

    return round($bytes, $precision) . " " . $units[$pow];
}

print formatBytes(memory_get_peak_usage());

// from reading-files-line-by-line-1.php

function readTheFile($path) {
    $lines = [];
    $handle = fopen($path, "r");

    while(!feof($handle)) {
        $lines[] = trim(fgets($handle));
    }

    fclose($handle);
    return $lines;
}

readTheFile("shakespeare.txt");

require "memory.php";
```

We’re reading a text file containing the complete works of Shakespeare. The text file is about **5.5MB**, and the peak memory usage is **12.8MB**. Now, let’s use a generator to read each line:

```php
// from reading-files-line-by-line-2.php

function readTheFile($path) {
    $handle = fopen($path, "r");

    while(!feof($handle)) {
        yield trim(fgets($handle));
    }

    fclose($handle);
}

readTheFile("shakespeare.txt");

require "memory.php";
```

The text file is the same size, but the peak memory usage is **393KB**. This doesn’t mean anything until we do something with the data we’re reading. Perhaps we can split the document into chunks whenever we see two blank lines. Something like this:

```php
// from reading-files-line-by-line-3.php

$iterator = readTheFile("shakespeare.txt");

$buffer = "";

foreach ($iterator as $iteration) {
    preg_match("/\n{3}/", $buffer, $matches);

    if (count($matches)) {
        print ".";
        $buffer = "";
    } else {
        $buffer .= $iteration . PHP_EOL;
    }
}

require "memory.php";
```

Any guesses how much memory we’re using now? Would it surprise you to know that, even though we split the text document up into **1,216** chunks, we still only use **459KB** of memory? Given the nature of generators, the most memory we’ll use is that which we need to store the largest text chunk in an iteration. In this case, the largest chunk is **101,985** characters.

_I’ve already written about the [performance boosts of using generators](https://www.sitepoint.com/memory-performance-boosts-with-generators-and-nikiciter/) and [Nikita Popov’s Iterator library](https://github.com/nikic/iter), so go check that out if you’d like to see more!_

Generators have other uses, but this one is demonstrably good for performant reading of large files. If we need to work on the data, generators are probably the best way.

## Piping Between Files

In situations where we don’t need to operate on the data, we can pass file data from one file to another. This is commonly called **piping** (presumably because we don’t see what’s inside a pipe except at each end … as long as it's opaque, of course!). We can achieve this by using stream methods. Let’s first write a script to transfer from one file to another, so that we can measure the memory usage:

```php
// from piping-files-1.php

file_put_contents(
    "piping-files-1.txt", file_get_contents("shakespeare.txt")
);

require "memory.php";
```

Unsurprisingly, this script uses slightly more memory to run than the text file it copies. That’s because it has to read (and keep) the file contents in memory until it has written to the new file. For small files, that may be okay. When we start to use bigger files, no so much…

Let’s try streaming (or piping) from one file to another:

```php
// from piping-files-2.php

$handle1 = fopen("shakespeare.txt", "r");
$handle2 = fopen("piping-files-2.txt", "w");

stream_copy_to_stream($handle1, $handle2);

fclose($handle1);
fclose($handle2);

require "memory.php";
```

This code is slightly strange. We open handles to both files, the first in read mode and the second in write mode. Then we copy from the first into the second. We finish by closing both files again. It may surprise you to know that the memory used is **393KB**.

That seems familiar. Isn’t that what the generator code used to store when reading each line? That’s because the second argument to `fgets` specifies how many bytes of each line to read (and defaults to `-1` or until it reaches a new line).

The third argument to `stream_copy_to_stream` is exactly the same sort of parameter (with exactly the same default). `stream_copy_to_stream` is reading from one stream, one line at a time, and writing it to the other stream. It skips the part where the generator yields a value, since we don’t need to work with that value.

Piping this text isn’t useful to us, so let’s think of other examples which might be. Suppose we wanted to output an image from our CDN, as a sort of redirected application route. We could illustrate it with code resembling the following:

```php
// from piping-files-3.php

file_put_contents(
    "piping-files-3.jpeg", file_get_contents(
        "https://github.com/assertchris/uploads/raw/master/rick.jpg"
    )
);

// ...or write this straight to stdout, if we don't need the memory info

require "memory.php";
```

Imagine an application route brought us to this code. But instead of serving up a file from the local file system, we want to get it from a CDN. We may substitute `file_get_contents` for something more elegant (like [Guzzle](http://docs.guzzlephp.org/en/stable/)), but under the hood it’s much the same.

The memory usage (for this image) is around **581KB**. Now, how about we try to stream this instead?

```php
// from piping-files-4.php

$handle1 = fopen(
    "https://github.com/assertchris/uploads/raw/master/rick.jpg", "r"
);

$handle2 = fopen(
    "piping-files-4.jpeg", "w"
);

// ...or write this straight to stdout, if we don't need the memory info

stream_copy_to_stream($handle1, $handle2);

fclose($handle1);
fclose($handle2);

require "memory.php";
```

The memory usage is slightly less (at **400KB**), but the result is the same. If we didn’t need the memory information, we could just as well print to standard output. In fact, PHP provides a simple way to do this:

```php
$handle1 = fopen(
    "https://github.com/assertchris/uploads/raw/master/rick.jpg", "r"
);

$handle2 = fopen(
    "php://stdout", "w"
);

stream_copy_to_stream($handle1, $handle2);

fclose($handle1);
fclose($handle2);

// require "memory.php";
```

### Other Streams

There are a few other streams we could pipe and/or write to and/or read from:

*   `php://stdin` (read-only)
*   `php://stderr` (write-only, like php://stdout)
*   `php://input` (read-only) which gives us access to the raw request body
*   `php://output` (write-only) which lets us write to an output buffer
*   `php://memory` and `php://temp` (read-write) are places we can store data temporarily. The difference is that `php://temp` will store the data in the file system once it becomes large enough, while `php://memory` will keep storing in memory until that runs out.

## Filters

There’s another trick we can use with streams called **filters**. They’re a kind of in-between step, providing a tiny bit of control over the stream data without exposing it to us. Imagine we wanted to compress our `shakespeare.txt`. We might use the Zip extension:

```php
// from filters-1.php

$zip = new ZipArchive();
$filename = "filters-1.zip";

$zip->open($filename, ZipArchive::CREATE);
$zip->addFromString("shakespeare.txt", file_get_contents("shakespeare.txt"));
$zip->close();

require "memory.php";
```

This is a neat bit of code, but it clocks in at around **10.75MB**. We can do better, with filters:

```php
// from filters-2.php

$handle1 = fopen(
    "php://filter/zlib.deflate/resource=shakespeare.txt", "r"
);

$handle2 = fopen(
    "filters-2.deflated", "w"
);

stream_copy_to_stream($handle1, $handle2);

fclose($handle1);
fclose($handle2);

require "memory.php";
```

Here, we can see the `php://filter/zlib.deflate` filter, which reads and compresses the contents of a resource. We can then pipe this compressed data into another file. This only uses **896KB**.

_I know this is not the same format, or that there are upsides to making a zip archive. You have to wonder though: if you could choose the different format and save 12 times the memory, wouldn’t you?_

To uncompress the data, we can run the deflated file back through another zlib filter:

```php
// from filters-2.php

file_get_contents(
    "php://filter/zlib.inflate/resource=filters-2.deflated"
);
```

Streams have been extensively covered in “[Understanding Streams in PHP](https://www.sitepoint.com/%EF%BB%BFunderstanding-streams-in-php/)” and “[Using PHP Streams Effectively](https://www.sitepoint.com/using-php-streams-effectively/)”. If you’d like a different perspective, check those out!

## Customizing Streams

`fopen` and `file_get_contents` have their own set of default options, but these are completely customizable. To define them, we need to create a new stream context:

```php
// from creating-contexts-1.php

$data = join("&", [
    "twitter=assertchris",
]);

$headers = join("\r\n", [
    "Content-type: application/x-www-form-urlencoded",
    "Content-length: " . strlen($data),
]);

$options = [
    "http" => [
        "method" => "POST",
        "header"=> $headers,
        "content" => $data,
    ],
];

$context = stream_content_create($options);

$handle = fopen("https://example.com/register", "r", false, $context);
$response = stream_get_contents($handle);

fclose($handle);
```

In this example, we’re trying to make a `POST` request to an API. The API endpoint is secure, but we still need to use the `http` context property (as is used for `http` and `https`). We set a few headers and open a file handle to the API. We can open the handle as read-only since the context takes care of the writing.

_There are loads of things we can customize, so it’s best to check out [the documentation](https://php.net/function.stream-context-create) if you want to know more._

## Making Custom Protocols and Filters

Before we wrap things up, let’s talk about making custom protocols. If you look at [the documentation](https://php.net/manual/en/class.streamwrapper.php), you can find an example class to implement:

```php
Protocol {
    public resource $context;
    public __construct ( void )
    public __destruct ( void )
    public bool dir_closedir ( void )
    public bool dir_opendir ( string $path , int $options )
    public string dir_readdir ( void )
    public bool dir_rewinddir ( void )
    public bool mkdir ( string $path , int $mode , int $options )
    public bool rename ( string $path_from , string $path_to )
    public bool rmdir ( string $path , int $options )
    public resource stream_cast ( int $cast_as )
    public void stream_close ( void )
    public bool stream_eof ( void )
    public bool stream_flush ( void )
    public bool stream_lock ( int $operation )
    public bool stream_metadata ( string $path , int $option , mixed $value )
    public bool stream_open ( string $path , string $mode , int $options ,
        string &$opened_path )
    public string stream_read ( int $count )
    public bool stream_seek ( int $offset , int $whence = SEEK_SET )
    public bool stream_set_option ( int $option , int $arg1 , int $arg2 )
    public array stream_stat ( void )
    public int stream_tell ( void )
    public bool stream_truncate ( int $new_size )
    public int stream_write ( string $data )
    public bool unlink ( string $path )
    public array url_stat ( string $path , int $flags )
}
```

We’re not going to implement one of these, since I think it is deserving of its own tutorial. There’s a lot of work that needs to be done. But once that work is done, we can register our stream wrapper quite easily:

```php
if (in_array("highlight-names", stream_get_wrappers())) {
    stream_wrapper_unregister("highlight-names");
}

stream_wrapper_register("highlight-names", "HighlightNamesProtocol");

$highlighted = file_get_contents("highlight-names://story.txt");
```

Similarly, it’s also possible to create custom stream filters. [The documentation](https://php.net/manual/en/class.php-user-filter.php) has an example filter class:

```php
Filter {
    public $filtername;
    public $params
    public int filter ( resource $in , resource $out , int &$consumed ,
        bool $closing )
    public void onClose ( void )
    public bool onCreate ( void )
    }
```

This can be registered just as easily:

```php
$handle = fopen("story.txt", "w+");
stream_filter_append($handle, "highlight-names", STREAM_FILTER_READ);
```

`highlight-names` needs to match the `filtername` property of the new filter class. It’s also possible to use custom filters in a `php://filter/highligh-names/resource=story.txt` string. It's much easier to define filters than it is to define protocols. One reason for this is that protocols need to handle directory operations, whereas filters only need to handle each chunk of data.

If you have the gumption, I strongly encourage you to experiment with creating custom protocols and filters. If you can apply filters to `stream_copy_to_stream` operations, your applications are going to use next to no memory even when working with obscenely large files. Imagine writing a `resize-image` filter or and `encrypt-for-application` filter.

## Summary

Though this isn’t a problem we frequently suffer from, it’s easy to mess up when working with large files. In asynchronous applications, it’s just as easy to bring the whole server down when we’re not careful about memory usage.

This tutorial has hopefully introduced you to a few new ideas (or refreshed your memory about them), so that you can think more about how to read and write large files efficiently. When we start to become familiar with streams and generators, and stop using functions like `file_get_contents`: an entire category of errors disappear from our applications. That seems like a good thing to aim for!
