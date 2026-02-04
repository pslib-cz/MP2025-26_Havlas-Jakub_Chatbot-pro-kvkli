import csv
import os

def fix_csv_file(input_file, output_file, chunk_size=10000):
    """
    Load a large CSV file, fix delimiter and quote issues, and save to a new file.
    
    Args:
        input_file: Path to the input CSV file
        output_file: Path to the output fixed CSV file
        chunk_size: Number of rows to process at a time
    """
    print(f"Processing {input_file}...")
    
    # Try to detect the delimiter and read the file
    with open(input_file, 'r', encoding='utf-8', errors='replace') as infile:
        # Read first few lines to detect delimiter
        sample = infile.read(8192)
        infile.seek(0)
        
        # Try common delimiters
        sniffer = csv.Sniffer()
        try:
            dialect = sniffer.sniff(sample, delimiters=',;\t|')
            delimiter = dialect.delimiter
        except:
            delimiter = ','  # Default to comma
        
        print(f"Detected delimiter: '{delimiter}'")
        
        # Read and fix the CSV
        reader = csv.reader(infile, delimiter=delimiter, quotechar='"', 
                          quoting=csv.QUOTE_MINIMAL, skipinitialspace=True)
        
        with open(output_file, 'w', encoding='utf-8', newline='') as outfile:
            writer = csv.writer(outfile, delimiter=',', quotechar='"', 
                              quoting=csv.QUOTE_MINIMAL)
            
            row_count = 0
            for row in reader:
                # Clean up stacked quotes in each field
                cleaned_row = [field.replace('""', '"').strip() for field in row]
                writer.writerow(cleaned_row)
                
                row_count += 1
                if row_count % chunk_size == 0:
                    print(f"Processed {row_count} rows...")
            
            print(f"Complete! Total rows processed: {row_count}")
            print(f"Output saved to: {output_file}")

if __name__ == "__main__":
    # Update this path to your actual input file
    input_csv = "complete_records.csv"  # Change to your input file path
    output_csv = "complete_records_fixed.csv"
    
    if os.path.exists(input_csv):
        fix_csv_file(input_csv, output_csv)
    else:
        print(f"Error: Input file '{input_csv}' not found.")
        print("Please update the 'input_csv' variable with the correct path.")
