using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading.Channels;
using System.Threading.Tasks;
using System.Xml.Linq;
using System.Diagnostics;
using System.IO;

class HarvesterProgram
{
    static async Task Main(string[] args)
    {
        string baseUrl = "https://ipac.kvkli.cz/arl-li/cs/oai/?verb=ListRecords&metadataPrefix=oai_marcxml_cpk&set=CPK";
        var client = new HttpClient();
        var stopwatch = Stopwatch.StartNew();
        var channel = Channel.CreateUnbounded<XDocument>();

        int i = 0;
        string folder = "harvested_xml";
        Directory.CreateDirectory(folder);

        // Producer
        _ = Task.Run(async () =>
        {
            Stopwatch stopwatch = Stopwatch.StartNew();
            string requestUrl = baseUrl;

            while (!string.IsNullOrEmpty(requestUrl))
            {
                using var response = await client.GetAsync(requestUrl);
                using var stream = await response.Content.ReadAsStreamAsync();

                // Detect encoding from headers if present
                var charset = response.Content.Headers.ContentType?.CharSet;
                Encoding encoding = !string.IsNullOrEmpty(charset) ? Encoding.GetEncoding(charset) : Encoding.UTF8;

                using var reader = new StreamReader(stream, encoding, detectEncodingFromByteOrderMarks: true);
                var doc = XDocument.Load(reader);

                // Save XML batch file
                string fileName = Path.Combine(folder, $"batch_{i:D6}.xml");
                File.WriteAllText(fileName, doc.ToString());

                // Send to consumers
                await channel.Writer.WriteAsync(doc);

                // Handle resumption token
                var token = doc.Descendants(XName.Get("resumptionToken", "http://www.openarchives.org/OAI/2.0/"))
                               .FirstOrDefault();

                requestUrl = token != null && !string.IsNullOrWhiteSpace(token.Value)
                    ? $"https://ipac.kvkli.cz/arl-li/cs/oai/?verb=ListRecords&resumptionToken={token.Value}"
                    : null;

                if (i % 100 == 0)
                {
                    Console.WriteLine($"Fetched {i} requests so far...");
                    Console.WriteLine($"Elapsed time: {stopwatch.Elapsed}");
                }

                i++;
            }

            channel.Writer.Complete();
            Console.WriteLine($"Finished fetching {i} batches.");
            Console.WriteLine($"Total time: {stopwatch.Elapsed}");
        });

        // Single CSV writer with thread-safe queue
        var csvQueue = new ConcurrentQueue<string>();
        var writerTask = Task.Run(async () =>
        {
            using var writer = new StreamWriter("complete_records.csv", false, Encoding.UTF8);
            
            // CSV Header
            writer.WriteLine("Identifier,Title,Author,Contributors,Publisher,PublicationYear,ISBN,ISSN,Subjects,Description,Language,PhysicalDescription,Series,Notes,RecordType,ContentType,MediaType,CarrierType");

            while (!channel.Reader.Completion.IsCompleted || !csvQueue.IsEmpty)
            {
                if (csvQueue.TryDequeue(out var line))
                {
                    await writer.WriteLineAsync(line);
                }
                else
                {
                    await Task.Delay(100);
                }
            }
        });

        // Consumers (parsers)
        var parserTasks = Enumerable.Range(0, Environment.ProcessorCount).Select(async _ =>
        {
            await foreach (var doc in channel.Reader.ReadAllAsync())
            {
                foreach (var rec in doc.Descendants(XName.Get("record", "http://www.openarchives.org/OAI/2.0/")))
                {
                    var book = ParseMarcXml(rec);
                    if (book != null)
                    {
                        string line = FormatCsvLine(book);
                        csvQueue.Enqueue(line);
                    }
                }
            }
        }).ToArray();

        await Task.WhenAll(parserTasks);
        await writerTask;

        Console.WriteLine($"\nProcessing complete!");
        Console.WriteLine($"Total time: {stopwatch.Elapsed}");
    }

    static string FormatCsvLine(BookRecord book)
    {
        return string.Join(",", 
            EscapeCsv(book.Identifier),
            EscapeCsv(book.Title),
            EscapeCsv(book.Author),
            EscapeCsv(book.Contributors),
            EscapeCsv(book.Publisher),
            EscapeCsv(book.PublicationYear),
            EscapeCsv(book.ISBN),
            EscapeCsv(book.ISSN),
            EscapeCsv(book.Subjects),
            EscapeCsv(book.Description),
            EscapeCsv(book.Language),
            EscapeCsv(book.PhysicalDescription),
            EscapeCsv(book.Series),
            EscapeCsv(book.Notes),
            EscapeCsv(book.RecordType),
            EscapeCsv(book.ContentType),
            EscapeCsv(book.MediaType),
            EscapeCsv(book.CarrierType)
        );
    }

    static string EscapeCsv(string? value)
    {
        if (string.IsNullOrEmpty(value))
            return "\"\"";
        
        // Replace quotes with double quotes and wrap in quotes
        value = value.Replace("\"", "\"\"");
        return $"\"{value}\"";
    }

    static BookRecord ParseMarcXml(XElement record)
    {
        XNamespace marcNs = "http://www.loc.gov/MARC21/slim";
        var marc = record.Descendants(marcNs + "record").FirstOrDefault();
        if (marc == null) return null;

        var book = new BookRecord();

        // Get identifier from header
        var header = record.Element(XName.Get("header", "http://www.openarchives.org/OAI/2.0/"));
        book.Identifier = header?.Element(XName.Get("identifier", "http://www.openarchives.org/OAI/2.0/"))?.Value;

        // Leader (008 field contains important info about record type)
        var leader = marc.Element(marcNs + "leader")?.Value;
        book.RecordType = leader;

        // Control fields
        var field008 = GetControlField(marc, "008");
        if (field008 != null && field008.Length > 38)
        {
            book.Language = field008.Substring(35, 3).Trim();
        }

        // Title (245)
        book.Title = GetSubfield(marc, "245", "a");
        var titleB = GetSubfield(marc, "245", "b");
        if (!string.IsNullOrEmpty(titleB))
            book.Title += " : " + titleB;
        var titleN = GetSubfield(marc, "245", "n");
        if (!string.IsNullOrEmpty(titleN))
            book.Title += " " + titleN;

        // Author (100, 110, 111)
        book.Author = GetSubfield(marc, "100", "a") ?? 
                     GetSubfield(marc, "110", "a") ?? 
                     GetSubfield(marc, "111", "a");

        // Additional authors/contributors (700, 710, 711)
        var contributors = new List<string>();
        contributors.AddRange(GetSubfields(marc, "700", "a"));
        contributors.AddRange(GetSubfields(marc, "710", "a"));
        contributors.AddRange(GetSubfields(marc, "711", "a"));
        book.Contributors = string.Join("; ", contributors);

        // Publisher and publication info (260, 264)
        var publisherA = GetSubfield(marc, "260", "a");
        var publisherB = GetSubfield(marc, "260", "b");
        var publisherC = GetSubfield(marc, "260", "c");
        book.Publisher = string.Join(" ", new[] { publisherA, publisherB }.Where(s => !string.IsNullOrEmpty(s)));
        book.PublicationYear = publisherC;

        // If no 260, try 264
        if (string.IsNullOrEmpty(book.Publisher))
        {
            var pub264A = GetSubfield(marc, "264", "a");
            var pub264B = GetSubfield(marc, "264", "b");
            var pub264C = GetSubfield(marc, "264", "c");
            book.Publisher = string.Join(" ", new[] { pub264A, pub264B }.Where(s => !string.IsNullOrEmpty(s)));
            if (string.IsNullOrEmpty(book.PublicationYear))
                book.PublicationYear = pub264C;
        }

        // ISBN (020)
        book.ISBN = GetSubfield(marc, "020", "a");

        // ISSN (022)
        book.ISSN = GetSubfield(marc, "022", "a");

        // Subjects (600-699 fields)
        var subjects = new List<string>();
        for (int tag = 600; tag < 700; tag++)
        {
            subjects.AddRange(GetSubfields(marc, tag.ToString(), "a"));
            subjects.AddRange(GetSubfields(marc, tag.ToString(), "x"));
        }
        book.Subjects = string.Join("; ", subjects.Distinct());

        // Description/Summary (520)
        book.Description = GetSubfield(marc, "520", "a");

        // Physical description (300)
        var physDesc = new List<string>();
        physDesc.AddRange(GetSubfields(marc, "300", "a"));
        physDesc.AddRange(GetSubfields(marc, "300", "b"));
        physDesc.AddRange(GetSubfields(marc, "300", "c"));
        book.PhysicalDescription = string.Join(" ", physDesc);

        // Series (490, 830)
        var series = new List<string>();
        series.AddRange(GetSubfields(marc, "490", "a"));
        series.AddRange(GetSubfields(marc, "830", "a"));
        book.Series = string.Join("; ", series);

        // Notes (500, 504, 505, 511, etc.)
        var notes = new List<string>();
        for (int tag = 500; tag < 600; tag++)
        {
            notes.AddRange(GetSubfields(marc, tag.ToString(), "a"));
        }
        book.Notes = string.Join("; ", notes);

        // RDA fields (336, 337, 338)
        book.ContentType = GetSubfield(marc, "336", "a");
        book.MediaType = GetSubfield(marc, "337", "a");
        book.CarrierType = GetSubfield(marc, "338", "a");

        return book;
    }

    static string? GetControlField(XElement marc, string tag)
    {
        XNamespace marcNs = "http://www.loc.gov/MARC21/slim";
        return marc.Elements(marcNs + "controlfield")
                   .FirstOrDefault(e => e.Attribute("tag")?.Value == tag)?.Value;
    }

    static string? GetSubfield(XElement record, string tag, string code) =>
        record.Elements().Where(e => e.Name.LocalName == "datafield" && e.Attribute("tag")?.Value == tag)
            .Elements().Where(sf => sf.Name.LocalName == "subfield" && sf.Attribute("code")?.Value == code)
            .Select(sf => sf.Value).FirstOrDefault();

    static IEnumerable<string> GetSubfields(XElement record, string tag, string code) =>
        record.Elements().Where(e => e.Name.LocalName == "datafield" && e.Attribute("tag")?.Value == tag)
            .Elements().Where(sf => sf.Name.LocalName == "subfield" && sf.Attribute("code")?.Value == code)
            .Select(sf => sf.Value);

    class BookRecord
    {
        public string? Identifier { get; set; }
        public string? Title { get; set; }
        public string? Author { get; set; }
        public string? Contributors { get; set; }
        public string? Publisher { get; set; }
        public string? PublicationYear { get; set; }
        public string? ISBN { get; set; }
        public string? ISSN { get; set; }
        public string? Subjects { get; set; }
        public string? Description { get; set; }
        public string? Language { get; set; }
        public string? PhysicalDescription { get; set; }
        public string? Series { get; set; }
        public string? Notes { get; set; }
        public string? RecordType { get; set; }
        public string? ContentType { get; set; }
        public string? MediaType { get; set; }
        public string? CarrierType { get; set; }
    }
}
